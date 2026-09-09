import { prisma } from '../server';
import { MetricaCampanhaDia, SaldoConta } from './tipos';
import * as googleAds from './googleAds';
import * as metaAds from './metaAds';

// ════════════════════════════════════════════════════════════════════════
// SERVIÇO DE SINCRONIZAÇÃO DE ANÚNCIOS (Google Ads + Meta Ads)
// ════════════════════════════════════════════════════════════════════════
// Puxa métricas diárias das plataformas, grava em MetricaDiaria (histórico)
// e mantém a tabela Campanha do CRM atualizada (1 linha por campanha externa).

// Janela sincronizada a cada rodada (dias para trás, contando de hoje)
const DIAS_SYNC = 90;
// Intervalo entre rodadas automáticas: 6 horas
const INTERVALO_SYNC_MS = 6 * 60 * 60 * 1000;
// Primeira rodada: 90s após o boot (dá tempo do banco/workers subirem)
const ATRASO_INICIAL_MS = 90 * 1000;
// Saldo/gasto do dia (04/09, pedido do dono da loja): roda SEPARADO da sync pesada de
// campanhas, e bem mais rápido — é 1 chamada leve por conta, não 90 dias de métricas.
// Saldo do META: a API aguenta ritmo alto, entao segue o pedido do dono (09/09): 15s.
const INTERVALO_SALDO_META_MS = 15 * 1000;
// Saldo do GOOGLE: o developer token esta no nivel "explorer access", cuja cota e do
// TOKEN INTEIRO (nao por conta). O polling de 60s x 6 contas x 2 consultas dava ~17 mil
// operacoes/dia e estourou a cota em 08/09 — resultado: saldo parado por mais de um dia.
// A 10 min sao ~1,7 mil operacoes/dia, com folga pra sync pesada. Pra ir mais rapido que
// isso e preciso o Google aprovar "Standard access" pro token (pedido no API Center).
const INTERVALO_SALDO_GOOGLE_MS = 10 * 60 * 1000;
const ATRASO_INICIAL_SALDO_MS = 15 * 1000;

export interface ResultadoSync {
  ok: boolean;
  campanhas: number;
  detalhe?: string;
}

// Sincroniza UMA conexão: busca métricas na plataforma, faz upsert em
// MetricaDiaria e atualiza/cria as linhas correspondentes em Campanha.
// NUNCA deixa exception vazar: qualquer erro é registrado em ultimoErro.
export async function sincronizarConexao(conexaoId: string): Promise<ResultadoSync> {
  let conexao: any = null;
  try {
    conexao = await prisma.conexaoAds.findUnique({ where: { id: conexaoId } });
    if (!conexao) return { ok: false, campanhas: 0, detalhe: 'Conexão não encontrada' };

    // A sync pesada tambem respeita o bloqueio de cota: sem isso ela batia 6x no Google
    // durante a punicao e RENOVAVA o bloqueio a cada rodada (achado 09/09).
    if (conexao.plataforma !== 'meta' && googleEstaBloqueado()) {
      return { ok: false, campanhas: 0, detalhe: 'cota do Google esgotada — aguardando liberacao antes de tentar de novo' };
    }

    // Credenciais ficam serializadas em JSON no banco
    let credenciais: any = {};
    try {
      credenciais = JSON.parse(conexao.credenciais || '{}') || {};
    } catch {
      throw new Error('Credenciais salvas estão corrompidas — salve a conexão novamente');
    }

    // 1) Busca as métricas na plataforma certa
    const metricas: MetricaCampanhaDia[] = conexao.plataforma === 'meta'
      ? await metaAds.buscarMetricasDiarias(credenciais, DIAS_SYNC)
      : await googleAds.buscarMetricasDiarias(credenciais, DIAS_SYNC);

    // 2) Upsert do histórico diário (unique conexaoId + campanhaExternalId + data)
    for (const m of metricas) {
      const dia = new Date(`${m.data}T00:00:00.000Z`); // meia-noite UTC = chave estável
      await prisma.metricaDiaria.upsert({
        where: {
          conexaoId_campanhaExternalId_data: {
            conexaoId: conexao.id,
            campanhaExternalId: m.campanhaExternalId,
            data: dia,
          },
        },
        update: {
          campanhaNome: m.campanhaNome,
          plataforma: conexao.plataforma,
          spend: m.spend,
          leads: m.leads,
          impressoes: m.impressoes,
          cliques: m.cliques,
        },
        create: {
          conexaoId: conexao.id,
          campanhaExternalId: m.campanhaExternalId,
          campanhaNome: m.campanhaNome,
          plataforma: conexao.plataforma,
          data: dia,
          spend: m.spend,
          leads: m.leads,
          impressoes: m.impressoes,
          cliques: m.cliques,
        },
      });
    }

    // 3) Agrega por campanha (soma do período sincronizado) para a tabela Campanha
    const porCampanha = new Map<string, { nome: string; status: 'Active' | 'Paused'; spend: number; leads: number }>();
    for (const m of metricas) {
      const atual = porCampanha.get(m.campanhaExternalId) || { nome: m.campanhaNome, status: m.status, spend: 0, leads: 0 };
      if (m.campanhaNome) atual.nome = m.campanhaNome;
      atual.status = m.status;
      atual.spend += m.spend;
      atual.leads += m.leads;
      porCampanha.set(m.campanhaExternalId, atual);
    }

    // 4) Upsert em Campanha: uma linha por campanha externa (external_id + conexao_id)
    const avisos: string[] = [];
    for (const [externalId, agg] of porCampanha) {
      try {
        const dados = {
          name: agg.nome,
          platform: conexao.plataforma === 'meta' ? 'Meta' : 'Google',
          status: agg.status,
          spend: Math.round(agg.spend * 100) / 100,
          leads: agg.leads,
        };
        const existente = await prisma.campanha.findFirst({
          where: { external_id: externalId, conexao_id: conexao.id },
        });
        if (existente) {
          await prisma.campanha.update({ where: { id: existente.id }, data: dados });
        } else if (conexao.company_id) {
          await prisma.campanha.create({
            data: {
              ...dados,
              company_id: conexao.company_id,
              store_id: conexao.store_id,
              external_id: externalId,
              conexao_id: conexao.id,
            },
          });
        } else {
          avisos.push(`campanha ${externalId} não criada no CRM (conexão sem empresa vinculada)`);
        }
      } catch (e: any) {
        avisos.push(`campanha ${externalId}: ${e?.message || e}`);
      }
    }

    // 5) Saldo e gasto do dia da CONTA (alimenta a tela "Saldos das Contas").
    // Try/catch SEPARADO: erro de saldo não pode derrubar o sync de campanhas.
    try {
      const info: SaldoConta = conexao.plataforma === 'meta'
        ? await metaAds.buscarSaldoConta(credenciais)
        : await googleAds.buscarSaldoConta(credenciais);

      const gastoDia = Math.round(info.gastoDia * 100) / 100;
      const existente = await prisma.contaAnuncio.findFirst({ where: { conexao_id: conexao.id } });
      if (existente) {
        // gastoDia atualiza SEMPRE; saldo só quando a plataforma informa (não-null) —
        // em conta pós-paga (saldo null) o valor manual do usuário é preservado.
        const dados: { gastoDia: number; saldo?: number } = { gastoDia };
        if (info.saldo !== null) dados.saldo = Math.round(info.saldo * 100) / 100;
        await prisma.contaAnuncio.update({ where: { id: existente.id }, data: dados });
      } else {
        await prisma.contaAnuncio.create({
          data: {
            nome: conexao.nome || (conexao.plataforma === 'meta' ? 'Conta Meta' : 'Conta Google'),
            plataforma: conexao.plataforma === 'meta' ? 'meta' : 'google',
            gastoDia,
            saldo: info.saldo !== null ? Math.round(info.saldo * 100) / 100 : 0,
            conexao_id: conexao.id,
          },
        });
      }
      // Saldo null = conta pós-paga: registramos no detalhe para o painel explicar
      if (info.saldo === null) {
        avisos.push('plataforma não informa saldo (conta pós-paga) — saldo manual mantido, só o gasto do dia foi atualizado');
      }
    } catch (e: any) {
      registrarBloqueioGoogle(e);
      avisos.push(`saldo da conta: ${e?.message || e}`);
    }

    // 6) Marca a sincronização como concluída (limpa o último erro)
    await prisma.conexaoAds.update({
      where: { id: conexao.id },
      data: { ultimaSync: new Date(), ultimoErro: null },
    });

    let detalhe = `${metricas.length} registro(s) diário(s) em ${porCampanha.size} campanha(s)`;
    if (avisos.length > 0) detalhe += ` — avisos: ${avisos.join('; ')}`.slice(0, 1000);

    return { ok: true, campanhas: porCampanha.size, detalhe };
  } catch (e: any) {
    // Registra o erro na conexão para aparecer no painel (sem tokens: as
    // integrações só devolvem mensagens de erro legíveis das plataformas)
    const msg = String(e?.message || e || 'Erro desconhecido').slice(0, 1000);
    if (conexao) {
      try {
        await prisma.conexaoAds.update({ where: { id: conexaoId }, data: { ultimoErro: msg } });
      } catch (errBanco) {
        console.error('[SyncAds] Falha ao registrar ultimoErro:', errBanco);
      }
    }
    return { ok: false, campanhas: 0, detalhe: msg };
  }
}

// Atualiza SO saldo/gasto do dia de uma conexao — chamada leve (1 requisicao na
// plataforma), pensada pra rodar com frequencia alta sem pesar na API nem no banco.
// Quando o Google devolve 429 ele informa em quantos segundos podemos voltar. Respeitar
// isso e o que faz a cota se recuperar — antes o worker ignorava e batia de novo em 60s.
let googleBloqueadoAte = 0;
function googleEstaBloqueado(): boolean {
  return Date.now() < googleBloqueadoAte;
}
function registrarBloqueioGoogle(e: any): void {
  if (!e?.cotaEsgotada) return;
  const seg = Number(e.retryDelaySegundos) || 3600;
  const ate = Date.now() + seg * 1000;
  if (ate > googleBloqueadoAte) {
    googleBloqueadoAte = ate;
    console.error(`[SyncAds] Cota do Google esgotada — pausando chamadas por ${Math.round(seg / 60)} min (volta ${new Date(ate).toISOString()}).`);
  }
}

async function atualizarSaldoConexao(conexaoId: string): Promise<void> {
  const conexao = await prisma.conexaoAds.findUnique({ where: { id: conexaoId } });
  if (!conexao) return;
  // Cota do Google estourada: nem tenta (bater de novo so renova o bloqueio).
  if (conexao.plataforma !== 'meta' && googleEstaBloqueado()) return;

  let credenciais: any = {};
  try {
    credenciais = JSON.parse(conexao.credenciais || '{}') || {};
  } catch {
    return; // credenciais corrompidas: a sync pesada de 6h ja registra esse erro
  }

  try {
    const info: SaldoConta = conexao.plataforma === 'meta'
      ? await metaAds.buscarSaldoConta(credenciais)
      : await googleAds.buscarSaldoConta(credenciais);

    const gastoDia = Math.round(info.gastoDia * 100) / 100;
    const existente = await prisma.contaAnuncio.findFirst({ where: { conexao_id: conexao.id } });
    if (existente) {
      const dados: { gastoDia: number; saldo?: number } = { gastoDia };
      if (info.saldo !== null) dados.saldo = Math.round(info.saldo * 100) / 100;
      await prisma.contaAnuncio.update({ where: { id: existente.id }, data: dados });
    } else {
      await prisma.contaAnuncio.create({
        data: {
          nome: conexao.nome || (conexao.plataforma === 'meta' ? 'Conta Meta' : 'Conta Google'),
          plataforma: conexao.plataforma === 'meta' ? 'meta' : 'google',
          gastoDia,
          saldo: info.saldo !== null ? Math.round(info.saldo * 100) / 100 : 0,
          conexao_id: conexao.id,
        },
      });
    }
    // A leitura leve deu certo: limpa o ultimoErro da conexao. Sem isto o painel continuava
    // dizendo "saldo indisponivel — cota esgotada" mesmo ja tendo o numero novo na tela,
    // porque so a sync pesada (de 6 em 6 horas) limpava esse campo (achado 09/09).
    if (conexao.ultimoErro) {
      await prisma.conexaoAds.update({ where: { id: conexao.id }, data: { ultimoErro: null, ultimaSync: new Date() } }).catch(() => {});
    }
  } catch (e: any) {
    registrarBloqueioGoogle(e);
    // Silencioso de proposito: essa rodada e frequente, entao um erro passageiro (rate
    // limit, instabilidade da plataforma) nao pode virar log toda hora. Erro persistente
    // continua visivel via ultimoErro, atualizado pela sync pesada de 6h.
  }
}

async function atualizarTodosSaldos(plataforma: 'meta' | 'google') {
  try {
    if (plataforma === 'google' && googleEstaBloqueado()) return;
    const conexoes = await prisma.conexaoAds.findMany({ where: { ativo: true, plataforma }, select: { id: true } });
    if (conexoes.length === 0) return;
    // Em serie, uma de cada vez: evita disparar N requisicoes simultaneas por minuto
    // contra o Meta/Google (cada conta e leve, mas juntas isso soma rate limit).
    for (const c of conexoes) {
      await atualizarSaldoConexao(c.id).catch(() => {});
    }
  } catch (e) {
    console.error('[SyncAds] Erro ao listar conexões para atualizar saldo:', e);
  }
}

// Sincroniza todas as conexões ATIVAS, em série (uma por vez), com try/catch
// por conexão — uma conta com problema não derruba as demais.
async function sincronizarTodasAtivas() {
  try {
    const conexoes = await prisma.conexaoAds.findMany({ where: { ativo: true } });
    if (conexoes.length === 0) return;
    console.log(`[SyncAds] Iniciando rodada de sincronização de ${conexoes.length} conexão(ões)...`);

    for (const conexao of conexoes) {
      try {
        const r = await sincronizarConexao(conexao.id);
        if (r.ok) {
          console.log(`[SyncAds] ✅ "${conexao.nome}" (${conexao.plataforma}): ${r.campanhas} campanha(s) sincronizada(s).`);
        } else {
          console.error(`[SyncAds] ❌ "${conexao.nome}" (${conexao.plataforma}): ${r.detalhe}`);
        }
      } catch (e: any) {
        // sincronizarConexao já trata erros; isto aqui é só cinto de segurança
        console.error(`[SyncAds] Erro inesperado na conexão ${conexao.id}:`, e?.message || e);
      }
    }
  } catch (e) {
    console.error('[SyncAds] Erro ao listar conexões ativas:', e);
  }
}

// Proteção contra init duplo (mesmo padrão dos outros workers do projeto)
let syncAdsIniciado = false;

// Inicia o worker de sincronização: 1ª rodada 90s após o boot e depois a cada 6h
export function initSyncAds() {
  if (syncAdsIniciado) return;
  syncAdsIniciado = true;

  console.log('[SyncAds] Worker de sincronização de anúncios iniciado (rodada inicial em 90s, depois a cada 6h)');
  setTimeout(() => {
    sincronizarTodasAtivas().catch((e) => console.error('[SyncAds] Erro na rodada inicial:', e));
  }, ATRASO_INICIAL_MS);
  setInterval(() => {
    sincronizarTodasAtivas().catch((e) => console.error('[SyncAds] Erro na rodada periódica:', e));
  }, INTERVALO_SYNC_MS);

  // Saldo/gasto do dia: roda a cada 1 minuto, independente da sync pesada de campanhas.
  console.log('[SyncAds] Saldo: Meta a cada 15s, Google a cada 10min (cota do token).');
  setTimeout(() => {
    atualizarTodosSaldos('meta').catch((e) => console.error('[SyncAds] Erro na 1a atualizacao de saldo (meta):', e));
    atualizarTodosSaldos('google').catch((e) => console.error('[SyncAds] Erro na 1a atualizacao de saldo (google):', e));
  }, ATRASO_INICIAL_SALDO_MS);
  setInterval(() => {
    atualizarTodosSaldos('meta').catch((e) => console.error('[SyncAds] Erro na atualizacao de saldo (meta):', e));
  }, INTERVALO_SALDO_META_MS);
  setInterval(() => {
    atualizarTodosSaldos('google').catch((e) => console.error('[SyncAds] Erro na atualizacao de saldo (google):', e));
  }, INTERVALO_SALDO_GOOGLE_MS);
}
