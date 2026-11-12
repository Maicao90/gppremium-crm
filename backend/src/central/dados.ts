import { ConfigCentral, EstadoCentral, LojaCentral } from './config';

// Leitura dos dados da Central de Trafego. So LE do que o CRM ja tem: MetricaDiaria (gasto/conversoes por
// campanha e dia, sincronizado a cada 15 min), ContaAnuncio (saldo), Deposito, Campanha e Mensagem
// (conversas). A unica escrita e o deposito detectado pelo aumento de saldo (detectarDepositos).

export type Plataforma = 'meta' | 'google';
export const PLATAFORMAS: Plataforma[] = ['meta', 'google'];

// prisma e os contatos internos vem por getter: o teste injeta os seus e nunca carrega o server.ts
// (que sobe o WhatsApp — uma 2a copia do Baileys derruba as sessoes).
let prismaInjetado: any = null;
let internosInjetado: (() => Promise<Set<string>>) | null = null;
export function usarDependencias(prisma: any, internos?: () => Promise<Set<string>>) {
  prismaInjetado = prisma;
  internosInjetado = internos || null;
}
const db = (): any => prismaInjetado || require('../server').prisma;
const internos = (): Promise<Set<string>> =>
  internosInjetado ? internosInjetado() : require('../services/contatosInternos').numerosInternos();
const JIDS_INTERNOS = (): string[] => {
  try { return internosInjetado ? [] : require('../services/contatosInternos').JIDS_INTERNOS; } catch { return []; }
};

// ── Datas (Brasilia = UTC-3, sem horario de verao) ──
const OFFSET_MS = 3 * 3600_000;
export function diaBR(d: Date = new Date()): string {
  return new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}
export function somarDias(dia: string, n: number): string {
  return new Date(Date.parse(dia + 'T12:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
}
export function horaBR(d: Date = new Date()): string {
  return new Date(d.getTime() - OFFSET_MS).toISOString().slice(11, 16);
}

export interface Periodo {
  diaIni: string; // YYYY-MM-DD (Brasilia), inclusivo
  diaFim: string; // inclusivo
  inicio: Date; // inicio do diaIni em Brasilia (UTC)
  fim: Date; // fim do diaFim em Brasilia (UTC, exclusivo)
}
export function periodo(diaIni: string, diaFim: string = diaIni): Periodo {
  return {
    diaIni,
    diaFim,
    inicio: new Date(Date.parse(diaIni + 'T00:00:00Z') + OFFSET_MS),
    fim: new Date(Date.parse(somarDias(diaFim, 1) + 'T00:00:00Z') + OFFSET_MS),
  };
}
// MetricaDiaria guarda o dia da plataforma como meia-noite UTC daquele dia.
const chaveDia = (dia: string) => new Date(dia + 'T00:00:00.000Z');

// ── Conexoes de anuncio das lojas ──
export interface ConexaoLoja {
  id: string;
  lojaId: string;
  plataforma: Plataforma;
  disponivel: boolean; // conectada e ultima sincronizacao sem erro
  ultimaSync: Date | null;
  contaExterna: string; // act_ da Meta ou customer id do Google (sem segredo)
}

async function conexoesDasLojas(lojas: LojaCentral[]): Promise<ConexaoLoja[]> {
  const ids = lojas.map((l) => l.id);
  const linhas = await db().conexaoAds.findMany({ where: { store_id: { in: ids }, plataforma: { in: PLATAFORMAS } } });
  return linhas.map((c: any) => {
    let cred: any = {};
    try { cred = JSON.parse(c.credenciais || '{}'); } catch { /* sem credencial legivel */ }
    const temCred = c.plataforma === 'meta' ? !!(cred.accessToken && cred.adAccountId) : !!cred.customerId || !!cred.refreshToken;
    return {
      id: c.id,
      lojaId: c.store_id,
      plataforma: c.plataforma,
      disponivel: !!c.ativo && temCred && !!c.ultimaSync && !c.ultimoErro,
      ultimaSync: c.ultimaSync || null,
      contaExterna: String((c.plataforma === 'meta' ? cred.adAccountId : cred.customerId) || '').replace(/^act_/, ''),
    };
  });
}

// ── Quais campanhas sao da LOJA ──
// 10/11 (dono): so conta campanha de loja. As contas Meta das lojas tambem rodam low ticket ("Ou", "OU | SEMPRE
// LIGADA", "PA"): na Meta a campanha tem que citar a loja no nome e nunca comecar com OU/PA. No Google as contas
// sao so da loja (ex.: "[TE] PESQUISA" da Direcional): entra tudo, menos OU/PA.
const LOW_TICKET = /^\s*(OU|PA)\b/;
const semAcento = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function regexDaLoja(loja: LojaCentral): RegExp {
  const n = semAcento(loja.nome);
  if (n.includes('CITY')) return /\bCITY\b/;
  if (n.includes('DIRECIONAL')) return /DIRECIONAL/;
  if (n.includes('FEIRAO')) return /FEIRAO/;
  if (n.includes('GP')) return /\bGP\b/;
  if (n.includes('SUPER')) return /\bSUPER\b|\bSVIA\b/;
  return new RegExp(`\\b${(n.split(/\s+/)[0] || n).replace(/[^A-Z0-9]/g, '')}\\b`);
}
export function campanhaDaLoja(nome: string, loja: LojaCentral, pl: Plataforma): boolean {
  const n = semAcento(nome);
  if (LOW_TICKET.test(n)) return false;
  return pl === 'google' || regexDaLoja(loja).test(n);
}

// ── Resultados por loja e plataforma ──
export interface ResultadoPlataforma { gasto: number; conversoes: number; disponivel: boolean; conectada: boolean }
export interface ResultadoLoja {
  loja: LojaCentral;
  meta: ResultadoPlataforma;
  google: ResultadoPlataforma;
  conversas: number | null; // null = nao foi possivel contar
}

export async function resultadosPorLoja(lojas: LojaCentral[], p: Periodo): Promise<{ lojas: ResultadoLoja[]; atualizadoEm: Date | null }> {
  const conexoes = await conexoesDasLojas(lojas);
  const somas = conexoes.length
    ? await db().metricaDiaria.groupBy({
      by: ['conexaoId', 'campanhaNome'],
      where: { conexaoId: { in: conexoes.map((c) => c.id) }, data: { gte: chaveDia(p.diaIni), lte: chaveDia(p.diaFim) } },
      _sum: { spend: true, leads: true },
    })
    : [];
  const somaPorConexao = new Map<string, { spend: number; leads: number }>();
  for (const s of somas) {
    const c = conexoes.find((x) => x.id === s.conexaoId);
    const loja = lojas.find((l) => l.id === c?.lojaId);
    if (!c || !loja || !campanhaDaLoja(s.campanhaNome, loja, c.plataforma)) continue;
    const atual = somaPorConexao.get(s.conexaoId) || { spend: 0, leads: 0 };
    atual.spend += Number(s._sum?.spend || 0);
    atual.leads += Number(s._sum?.leads || 0);
    somaPorConexao.set(s.conexaoId, atual);
  }

  let conversas: Map<string, number> | null = null;
  try { conversas = await conversasPorLoja(lojas, p); } catch (e) {
    console.error('[Central] falha ao contar conversas:', (e as any)?.message || e);
  }

  const resultado = lojas.map((loja) => {
    const plat = (pl: Plataforma): ResultadoPlataforma => {
      const cs = conexoes.filter((c) => c.lojaId === loja.id && c.plataforma === pl);
      let gasto = 0;
      let conversoes = 0;
      for (const c of cs) { const s = somaPorConexao.get(c.id); if (s) { gasto += s.spend; conversoes += s.leads; } }
      return { gasto: arred(gasto), conversoes, disponivel: cs.some((c) => c.disponivel), conectada: cs.length > 0 };
    };
    return { loja, meta: plat('meta'), google: plat('google'), conversas: conversas ? conversas.get(loja.id) ?? 0 : null };
  });
  const syncs = conexoes.map((c) => c.ultimaSync).filter(Boolean) as Date[];
  const atualizadoEm = syncs.length ? new Date(Math.min(...syncs.map((d) => d.getTime()))) : null;
  return { lojas: resultado, atualizadoEm };
}

// Conversas recebidas = contatos diferentes que MANDARAM mensagem no periodo, por numero de WhatsApp da loja
// (conexoes reais: quem compartilha o numero de outra atendente nao conta de novo). Fora: grupos, canais, status
// e numeros internos (equipe, lojas do grupo, fornecedores) — mesma regra das metricas do painel.
async function conversasPorLoja(lojas: LojaCentral[], p: Periodo): Promise<Map<string, number>> {
  const usuarios = await db().usuario.findMany({
    where: { ativo: true, externo: false, demo: false, whatsappDonoId: null, lojaId: { in: lojas.map((l) => l.id) } },
    select: { id: true, lojaId: true },
  });
  const porLoja = new Map<string, number>();
  if (!usuarios.length) return porLoja;
  // Lista vazia vira um valor que nunca casa (o Postgres nao tipa um ANY de array vazio).
  const numerosInternos = [...(await internos())];
  if (!numerosInternos.length) numerosInternos.push('__nenhum__');
  const jidsInternos = JIDS_INTERNOS().length ? JIDS_INTERNOS() : ['__nenhum__'];
  // Distinto por LOJA, nao por atendente: City, Direcional e Feirao tem 2 atendentes conectadas no MESMO numero
  // (2 sessoes) e cada mensagem fica gravada 2 vezes — somar por atendente dobrava a conta (10/11: 389 x 249).
  const linhas: Array<{ usuarioId: string; chatJid: string }> = await db().$queryRaw`
    SELECT DISTINCT "usuarioId", "chatJid"
    FROM "Mensagem"
    WHERE "fromMe" = false
      AND "timestamp" >= ${p.inicio} AND "timestamp" < ${p.fim}
      AND "usuarioId" = ANY(${usuarios.map((u: any) => u.id)})
      AND "chatJid" NOT LIKE '%@g.us' AND "chatJid" NOT LIKE '%broadcast%' AND "chatJid" NOT LIKE '%@newsletter'
      AND NOT ("chatJid" = ANY(${jidsInternos}))
      AND NOT (split_part(COALESCE("numeroReal", ''), ':', 1) = ANY(${numerosInternos}))`;
  const lojaDoUsuario = new Map<string, string>(usuarios.map((u: any) => [u.id, u.lojaId]));
  const chatsPorLoja = new Map<string, Set<string>>();
  for (const l of linhas) {
    const lojaId = lojaDoUsuario.get(l.usuarioId);
    if (!lojaId) continue;
    const set = chatsPorLoja.get(lojaId) || new Set<string>();
    set.add(l.chatJid);
    chatsPorLoja.set(lojaId, set);
  }
  for (const [lojaId, set] of chatsPorLoja) porLoja.set(lojaId, set.size);
  return porLoja;
}

// ── Saldos ──
export type NivelSaldo = 'normal' | 'atencao' | 'critico' | 'desconhecido';
export interface SaldoConta {
  contaId: string;
  loja: LojaCentral;
  plataforma: Plataforma;
  saldo: number | null; // null = nao verificavel
  mediaDiaria: number | null; // gasto medio dos ultimos 7 dias completos
  autonomiaDias: number | null;
  nivel: NivelSaldo;
  recargaSugerida: number | null;
  linkPagamento: string;
  contaExterna: string;
}

export async function saldosDasLojas(cfg: ConfigCentral, hoje: string = diaBR()): Promise<SaldoConta[]> {
  const conexoes = await conexoesDasLojas(cfg.lojas);
  if (!conexoes.length) return [];
  const contas = await db().contaAnuncio.findMany({ where: { conexao_id: { in: conexoes.map((c) => c.id) } } });
  const ini = somarDias(hoje, -7);
  const fim = somarDias(hoje, -1);
  const gastos = await db().metricaDiaria.groupBy({
    by: ['conexaoId'],
    where: { conexaoId: { in: conexoes.map((c) => c.id) }, data: { gte: chaveDia(ini), lte: chaveDia(fim) } },
    _sum: { spend: true },
  });
  const gasto7 = new Map<string, number>(gastos.map((g: any) => [g.conexaoId, Number(g._sum?.spend || 0)]));

  const saida: SaldoConta[] = [];
  for (const loja of cfg.lojas) {
    for (const pl of PLATAFORMAS) {
      const c = conexoes.find((x) => x.lojaId === loja.id && x.plataforma === pl);
      if (!c) continue;
      const conta = contas.find((x: any) => x.conexao_id === c.id);
      if (!conta) continue;
      const saldo = c.disponivel ? arred(Number(conta.saldo)) : null;
      const media = gasto7.has(c.id) ? arred((gasto7.get(c.id) || 0) / 7) : null;
      const autonomia = saldo !== null && media && media > 0 ? Math.max(0, saldo) / media : null;
      const minimo = (cfg.alertas.saldoMinimo || {})[`${loja.id}:${pl}`] || {};
      let nivel: NivelSaldo = 'desconhecido';
      if (saldo !== null) {
        nivel = 'normal';
        const rodando = !!media && media > 0;
        if ((rodando && autonomia !== null && autonomia < cfg.alertas.diasAtencao) || (minimo.atencao !== undefined && saldo < minimo.atencao)) nivel = 'atencao';
        if ((rodando && autonomia !== null && autonomia < cfg.alertas.diasCritico) || (minimo.critico !== undefined && saldo < minimo.critico)) nivel = 'critico';
      }
      const recarga = nivel === 'atencao' || nivel === 'critico'
        ? Math.max(50, Math.ceil(((media || 0) * cfg.alertas.diasRecarga) / 50) * 50)
        : null;
      saida.push({
        contaId: conta.id,
        loja,
        plataforma: pl,
        saldo,
        mediaDiaria: media,
        autonomiaDias: autonomia !== null ? Math.round(autonomia * 10) / 10 : null,
        nivel,
        recargaSugerida: recarga,
        linkPagamento: linkPagamento(pl, c.contaExterna),
        contaExterna: c.contaExterna,
      });
    }
  }
  return saida;
}

// Pagina OFICIAL de pagamento (nenhuma das duas tem API publica que gere Pix).
function linkPagamento(pl: Plataforma, conta: string): string {
  if (pl === 'meta') return conta ? `https://business.facebook.com/billing_hub/accounts/details?asset_id=${conta}` : 'https://business.facebook.com/billing_hub/';
  return 'https://ads.google.com/aw/billing/summary';
}

// ── Depositos (recargas) ──
export interface DepositoLinha { id: string; loja: LojaCentral; plataforma: Plataforma; data: string; valor: number; origem: string }

export async function depositosDoPeriodo(cfg: ConfigCentral, estado: EstadoCentral, diaIni: string, diaFim: string): Promise<DepositoLinha[]> {
  const conexoes = await conexoesDasLojas(cfg.lojas);
  const contas = await db().contaAnuncio.findMany({ where: { conexao_id: { in: conexoes.map((c) => c.id) } }, select: { id: true, conexao_id: true } });
  if (!contas.length) return [];
  const deps = await db().deposito.findMany({
    where: { contaId: { in: contas.map((c: any) => c.id) }, data: { gte: diaIni, lte: diaFim } },
    orderBy: { data: 'asc' },
  });
  const detectados = new Set(estado.depositosDetectados);
  const saida: DepositoLinha[] = [];
  for (const d of deps) {
    const conta = contas.find((c: any) => c.id === d.contaId);
    const conexao = conexoes.find((c) => c.id === conta?.conexao_id);
    const loja = cfg.lojas.find((l) => l.id === conexao?.lojaId);
    if (!conexao || !loja) continue;
    saida.push({ id: d.id, loja, plataforma: conexao.plataforma, data: d.data, valor: arred(Number(d.valor)), origem: detectados.has(d.id) ? 'detectado pelo saldo' : 'registro manual' });
  }
  return saida;
}

// Deposito pelo AUMENTO de saldo (o token de sistema da Meta nao le o historico de pagamentos e o Google nao
// expoe depositos na API). A 1a leitura de cada conta depois que o processo sobe so serve de base: assim a
// troca do calculo do saldo (ou um saldo velho em memoria) nunca vira deposito falso.
const contasComBase = new Set<string>();
export async function detectarDepositos(cfg: ConfigCentral, estado: EstadoCentral): Promise<DepositoLinha[]> {
  const saldos = await saldosDasLojas(cfg);
  const hoje = diaBR();
  const novos: DepositoLinha[] = [];
  for (const s of saldos) {
    if (s.saldo === null) continue;
    const anterior = estado.saldos[s.contaId];
    estado.saldos[s.contaId] = s.saldo;
    if (!contasComBase.has(s.contaId)) { contasComBase.add(s.contaId); continue; }
    if (anterior === undefined) continue;
    const aumento = arred(s.saldo - anterior);
    // 12/11: abaixo de R$10 e ajuste/credito do proprio Google (R$1,58, R$2,24...), nao recarga.
    if (aumento < 10) continue;
    // Ja registrado a mao no mesmo dia com o mesmo valor (+-R$1): nao duplica.
    const manual = await db().deposito.findFirst({ where: { contaId: s.contaId, data: hoje, valor: { gte: aumento - 1, lte: aumento + 1 } } });
    if (manual) continue;
    const criado = await db().deposito.create({ data: { contaId: s.contaId, valor: aumento, data: hoje } });
    estado.depositosDetectados.push(criado.id);
    novos.push({ id: criado.id, loja: s.loja, plataforma: s.plataforma, data: hoje, valor: aumento, origem: 'detectado pelo saldo' });
  }
  return novos;
}

// Registro manual (comando DEPOSITO). Nao duplica um deposito ja detectado no mesmo dia com o mesmo valor.
export async function registrarDepositoManual(cfg: ConfigCentral, lojaId: string, pl: Plataforma, valor: number, dia: string = diaBR()): Promise<'ok' | 'duplicado' | 'sem_conta'> {
  const conexoes = await conexoesDasLojas(cfg.lojas);
  const c = conexoes.find((x) => x.lojaId === lojaId && x.plataforma === pl);
  const conta = c ? await db().contaAnuncio.findFirst({ where: { conexao_id: c.id } }) : null;
  if (!conta) return 'sem_conta';
  const igual = await db().deposito.findFirst({ where: { contaId: conta.id, data: dia, valor: { gte: valor - 1, lte: valor + 1 } } });
  if (igual) return 'duplicado';
  await db().deposito.create({ data: { contaId: conta.id, valor: arred(valor), data: dia } });
  return 'ok';
}

// ── Campanhas ativas (so sob pedido) ──
export interface CampanhaLinha {
  loja: LojaCentral;
  plataforma: Plataforma;
  nome: string;
  status: string;
  gasto: number;
  conversoes: number;
  impressoes: number;
  cliques: number;
  orcamentoDiario: number | null;
}

export async function campanhasAtivas(lojas: LojaCentral[], plataformas: Plataforma[], p: Periodo): Promise<CampanhaLinha[]> {
  const conexoes = (await conexoesDasLojas(lojas)).filter((c) => plataformas.includes(c.plataforma));
  if (!conexoes.length) return [];
  const campanhas = await db().campanha.findMany({ where: { conexao_id: { in: conexoes.map((c) => c.id) }, status: 'Active' } });
  const metricas = await db().metricaDiaria.groupBy({
    by: ['conexaoId', 'campanhaExternalId'],
    where: { conexaoId: { in: conexoes.map((c) => c.id) }, data: { gte: chaveDia(p.diaIni), lte: chaveDia(p.diaFim) } },
    _sum: { spend: true, leads: true, impressoes: true, cliques: true },
  });
  const chave = (conexaoId: string, ext: string) => `${conexaoId}|${ext}`;
  const porCampanha = new Map<string, any>(metricas.map((m: any) => [chave(m.conexaoId, m.campanhaExternalId), m._sum || {}]));
  const saida: CampanhaLinha[] = [];
  for (const camp of campanhas) {
    const conexao = conexoes.find((c) => c.id === camp.conexao_id);
    const loja = lojas.find((l) => l.id === conexao?.lojaId);
    if (!conexao || !loja || !campanhaDaLoja(camp.name, loja, conexao.plataforma)) continue;
    const m = porCampanha.get(chave(conexao.id, String(camp.external_id || ''))) || {};
    saida.push({
      loja,
      plataforma: conexao.plataforma,
      nome: camp.name,
      status: camp.status,
      gasto: arred(Number(m.spend || 0)),
      conversoes: Number(m.leads || 0),
      impressoes: Number(m.impressoes || 0),
      cliques: Number(m.cliques || 0),
      orcamentoDiario: camp.daily_budget ?? null,
    });
  }
  // Ordem: loja (ordem da config), plataforma (Meta, Google), maior gasto primeiro.
  const ordemLoja = new Map(lojas.map((l, i) => [l.id, i]));
  saida.sort((a, b) => (ordemLoja.get(a.loja.id)! - ordemLoja.get(b.loja.id)!) || (PLATAFORMAS.indexOf(a.plataforma) - PLATAFORMAS.indexOf(b.plataforma)) || b.gasto - a.gasto);
  return saida;
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}
