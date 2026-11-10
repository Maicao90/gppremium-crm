import { configCentral, ConfigCentral, gravarEstado, LojaCentral, lerEstado, registrarLog } from './config';
import {
  campanhasAtivas, CampanhaLinha, depositosDoPeriodo, detectarDepositos, diaBR, horaBR, periodo, Plataforma,
  PLATAFORMAS, registrarDepositoManual, resultadosPorLoja, saldosDasLojas, somarDias,
} from './dados';
import {
  alertaSaldo, brl, detalheCampanha, juntarEmMensagens, menuCampanhas, menuLojas, menuMetaGoogle, menuPlataforma,
  menuPrincipal, menuRecargas, relatorioCampanhas, relatorioGeral, relatorioPlataforma, relatorioRecargas, relatorioSaldos,
} from './mensagens';

// Central de Trafego via WhatsApp (10/11). Numero Baileys DEDICADO (cfg.usuarioIdRemetente): manda o relatorio das
// 8h, responde aos comandos dos numeros autorizados e avisa saldo baixo. O robo de atendimento nunca entra nessa
// sessao (o hook do whatsappService devolve antes) e numero nao autorizado nao recebe resposta nenhuma.

// whatsappService e carregado na hora (ele importa este arquivo: import no topo viraria ciclo).
const wa = () => require('../workers/whatsappService');

export function ehSessaoCentral(usuarioId: string): boolean {
  const cfg = configCentral();
  return !!cfg.usuarioIdRemetente && cfg.usuarioIdRemetente === usuarioId;
}

// ── Autorizacao ──
const variantes = (n: string): string[] => {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  const s = new Set([d]);
  if (d.length === 11 && d[2] === '9') s.add(d.slice(0, 2) + d.slice(3));
  if (d.length === 10 && /[6-9]/.test(d[2] || '')) s.add(d.slice(0, 2) + '9' + d.slice(2));
  return [...s];
};
function autorizado(cfg: ConfigCentral, numero: string): boolean {
  if (!numero) return false;
  const v = new Set(variantes(numero));
  return cfg.numerosAutorizados.some((a) => variantes(a).some((x) => v.has(x)));
}
async function numeroDoRemetente(sock: any, msg: any): Promise<string> {
  const jid = String(msg?.key?.remoteJid || '');
  if (!jid.includes('@lid')) return jid.split('@')[0] || '';
  const alt = msg?.key?.remoteJidAlt || msg?.key?.senderPn || msg?.key?.participantPn;
  if (alt && String(alt).includes('@')) return String(alt).split('@')[0] || '';
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (pn && String(pn).includes('@')) return String(pn).split('@')[0] || '';
  } catch { /* sem mapeamento */ }
  return '';
}

// ── Envio ──
async function responder(usuarioId: string, jid: string, blocos: string[] | string) {
  const sock = wa().sessions.get(usuarioId);
  if (!sock) throw new Error('sessao da central desconectada');
  const msgs = Array.isArray(blocos) ? juntarEmMensagens(blocos) : [blocos];
  for (const texto of msgs) {
    await sock.sendMessage(jid, { text: texto });
    if (msgs.length > 1) await new Promise((r) => setTimeout(r, 1200));
  }
}
async function enviarParaNumero(cfg: ConfigCentral, numero: string, blocos: string[]): Promise<boolean> {
  for (const texto of juntarEmMensagens(blocos)) {
    const ok = await wa().enviarMensagem(cfg.usuarioIdRemetente, numero, texto);
    if (!ok) return false;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return true;
}

// ── Relatorios ──
const inicioDoMes = (dia: string) => dia.slice(0, 8) + '01';

export async function montarRelatorioDiario(cfg: ConfigCentral, dia: string = somarDias(diaBR(), -1)): Promise<string[]> {
  const [{ lojas }, saldos, deps] = await Promise.all([
    resultadosPorLoja(cfg.lojas, periodo(dia)),
    saldosDasLojas(cfg),
    depositosDoPeriodo(cfg, lerEstado(), inicioDoMes(dia), diaBR()),
  ]);
  return relatorioGeral({ titulo: 'RELATÓRIO DIÁRIO', ini: dia, fim: dia, resultados: lojas, saldos, recargas: { deps, ini: inicioDoMes(dia), fim: diaBR() }, comMenu: true });
}

async function relatorioHoje(cfg: ConfigCentral, lojas: LojaCentral[] = cfg.lojas): Promise<string[]> {
  const hoje = diaBR();
  const [{ lojas: rs, atualizadoEm }, saldos] = await Promise.all([resultadosPorLoja(lojas, periodo(hoje)), saldosDasLojas(cfg)]);
  return relatorioGeral({ titulo: lojas.length === 1 ? lojas[0]!.nome.toUpperCase() : 'HOJE ATÉ AGORA', ini: hoje, fim: hoje, resultados: rs, saldos, atualizadoEm: atualizadoEm ? horaBR(atualizadoEm) : horaBR() });
}

async function relatorioSemana(cfg: ConfigCentral): Promise<string[]> {
  const fim = somarDias(diaBR(), -1);
  const ini = somarDias(fim, -6);
  const { lojas } = await resultadosPorLoja(cfg.lojas, periodo(ini, fim));
  return relatorioGeral({ titulo: 'ÚLTIMOS 7 DIAS', ini, fim, resultados: lojas });
}

// ── Menus (estado por conversa, expira em 30 min) ──
type Tela = 'principal' | 'campanhas' | 'campanhas_loja' | 'campanhas_plat' | 'campanhas_lista' | 'lojas' | 'meta' | 'google' | 'recargas' | 'recargas_loja' | 'deposito';
interface Sessao { tela: Tela; pilha: Tela[]; dados: any; em: number }
const sessoes = new Map<string, Sessao>();
const sessaoDe = (jid: string): Sessao => {
  const s = sessoes.get(jid);
  if (s && Date.now() - s.em < 30 * 60_000) return s;
  const nova: Sessao = { tela: 'principal', pilha: [], dados: {}, em: Date.now() };
  sessoes.set(jid, nova);
  return nova;
};
function ir(s: Sessao, tela: Tela) { if (s.tela !== tela) s.pilha.push(s.tela); s.tela = tela; }

const normalizar = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const COMANDO_POR_NUMERO = ['HOJE', 'CAMPANHAS', 'LOJAS', 'META', 'GOOGLE', 'SALDOS', 'RECARGAS', 'SEMANA'];

function acharLoja(cfg: ConfigCentral, termo: string): LojaCentral | null {
  const t = normalizar(termo);
  if (/^\d+$/.test(t)) return cfg.lojas[Number(t) - 1] || null;
  const apelidos: Record<string, string> = { GP: 'GP PREMIUM', SUPERVIA: 'SUPER VIA', FEIRAO: 'FEIRAO', DIRECIONAL: 'DIRECIONAL', CITY: 'CITY' };
  const alvo = apelidos[t.replace(/\s/g, '')] || t;
  return cfg.lojas.find((l) => normalizar(l.nome).includes(alvo)) || null;
}

async function executar(cfg: ConfigCentral, s: Sessao, texto: string): Promise<string[] | string> {
  const t = normalizar(texto);
  const nums = /^\d+$/.test(t) ? Number(t) : null;

  if (t === 'MENU' || t === 'INICIO' || t === 'AJUDA' || t === 'OI') { s.tela = 'principal'; s.pilha = []; return menuPrincipal(); }
  if (t === 'VOLTAR') {
    const ant = s.pilha.pop() || 'principal';
    s.tela = ant;
    return telaTexto(cfg, s);
  }

  // DEPOSITO <loja> <META|GOOGLE> <valor> — lancamento manual, com confirmacao
  const dep = /^DEPOSITO\s+(.+?)\s+(META|GOOGLE)\s+(?:R\$\s*)?([\d.,]+)$/.exec(t);
  if (dep) {
    const loja = acharLoja(cfg, dep[1]!);
    const valor = Number(dep[3]!.includes(',') ? dep[3]!.replace(/\./g, '').replace(',', '.') : dep[3]);
    if (!loja || !(valor > 0)) return `Não entendi o depósito. Use: *DEPOSITO <loja> <META ou GOOGLE> <valor>*\nEx.: DEPOSITO GP META 500\nLojas: ${cfg.lojas.map((l) => l.nome).join(', ')}`;
    ir(s, 'deposito');
    s.dados.deposito = { lojaId: loja.id, loja: loja.nome, pl: dep[2]!.toLowerCase(), valor };
    return `💵 *CONFIRMAR DEPÓSITO*\n🏪 ${loja.nome}\n📡 ${dep[2] === 'META' ? 'Meta Ads' : 'Google Ads'}\n💰 ${brl(valor)}\n📅 ${diaBR().split('-').reverse().join('/')}\n\n1 — Confirmar\n2 — Cancelar`;
  }
  if (s.tela === 'deposito' && nums) {
    const d = s.dados.deposito;
    s.tela = 'principal'; s.pilha = [];
    if (nums !== 1 || !d) return 'Depósito cancelado.';
    const r = await registrarDepositoManual(cfg, d.lojaId, d.pl as Plataforma, d.valor);
    registrarLog('deposito_manual', { loja: d.loja, plataforma: d.pl, valor: d.valor, resultado: r });
    if (r === 'duplicado') return `Esse depósito (${brl(d.valor)}) já estava registrado hoje para ${d.loja} — não lancei de novo.`;
    if (r === 'sem_conta') return `Não achei a conta ${d.pl === 'meta' ? 'Meta' : 'Google'} da ${d.loja} no CRM.`;
    return `✅ Depósito de ${brl(d.valor)} registrado para ${d.loja} (${d.pl === 'meta' ? 'Meta' : 'Google'}).`;
  }

  // Numero = opcao da tela atual
  if (nums !== null && s.tela !== 'principal') return opcao(cfg, s, nums);
  const cmd = nums !== null ? COMANDO_POR_NUMERO[nums - 1] : t === 'CAMPANHAS ATIVAS' ? 'CAMPANHAS' : t;

  switch (cmd) {
    case 'HOJE': return relatorioHoje(cfg);
    case 'SEMANA': return relatorioSemana(cfg);
    case 'SALDOS': return relatorioSaldos(await saldosDasLojas(cfg), cfg.lojas);
    case 'CAMPANHAS': ir(s, 'campanhas'); return menuCampanhas();
    case 'LOJAS': ir(s, 'lojas'); return menuLojas(cfg.lojas);
    case 'META': ir(s, 'meta'); return menuMetaGoogle('meta', cfg.lojas);
    case 'GOOGLE': ir(s, 'google'); return menuMetaGoogle('google', cfg.lojas);
    case 'RECARGAS': ir(s, 'recargas'); return menuRecargas();
    default: return `Não reconheci "${texto.slice(0, 40)}".\n\n${menuPrincipal()}`;
  }
}

async function telaTexto(cfg: ConfigCentral, s: Sessao): Promise<string> {
  switch (s.tela) {
    case 'campanhas': return menuCampanhas();
    case 'campanhas_loja': case 'lojas': case 'recargas_loja': return menuLojas(cfg.lojas);
    case 'campanhas_plat': return menuPlataforma();
    case 'meta': return menuMetaGoogle('meta', cfg.lojas);
    case 'google': return menuMetaGoogle('google', cfg.lojas);
    case 'recargas': return menuRecargas();
    case 'campanhas_lista': s.tela = 'campanhas'; return menuCampanhas();
    default: s.tela = 'principal'; s.pilha = []; return menuPrincipal();
  }
}

async function listarCampanhas(cfg: ConfigCentral, s: Sessao, lojas: LojaCentral[], plats: Plataforma[], titulo: string): Promise<string[]> {
  const hoje = diaBR();
  const [camps, saldos] = await Promise.all([campanhasAtivas(lojas, plats, periodo(hoje)), saldosDasLojas(cfg)]);
  s.dados.campanhas = camps;
  ir(s, 'campanhas_lista');
  return relatorioCampanhas(titulo, hoje, camps, plats, saldos, lojas);
}

async function opcao(cfg: ConfigCentral, s: Sessao, n: number): Promise<string[] | string> {
  const invalida = async () => `Opção ${n} não existe aqui.\n\n${await telaTexto(cfg, s)}`;
  switch (s.tela) {
    case 'campanhas':
      if (n === 1) return listarCampanhas(cfg, s, cfg.lojas, PLATAFORMAS, 'Todas as lojas');
      if (n === 2) return listarCampanhas(cfg, s, cfg.lojas, ['meta'], 'Todas as lojas — Meta');
      if (n === 3) return listarCampanhas(cfg, s, cfg.lojas, ['google'], 'Todas as lojas — Google');
      if (n === 4) { ir(s, 'campanhas_loja'); return menuLojas(cfg.lojas); }
      return invalida();
    case 'campanhas_loja': {
      const loja = cfg.lojas[n - 1];
      if (!loja) return invalida();
      s.dados.lojaCampanha = loja;
      ir(s, 'campanhas_plat');
      return menuPlataforma();
    }
    case 'campanhas_plat': {
      const loja: LojaCentral = s.dados.lojaCampanha;
      const plats: Plataforma[] | null = n === 1 ? ['meta'] : n === 2 ? ['google'] : n === 3 ? PLATAFORMAS : null;
      if (!loja || !plats) return invalida();
      return listarCampanhas(cfg, s, [loja], plats, loja.nome);
    }
    case 'campanhas_lista': {
      const c: CampanhaLinha | undefined = (s.dados.campanhas || [])[n - 1];
      return c ? detalheCampanha(n, c) : invalida();
    }
    case 'lojas': {
      const loja = cfg.lojas[n - 1];
      return loja ? relatorioHoje(cfg, [loja]) : invalida();
    }
    case 'meta': case 'google': {
      const pl = s.tela as Plataforma;
      const lojas = n === 1 ? cfg.lojas : cfg.lojas[n - 2] ? [cfg.lojas[n - 2]!] : null;
      if (!lojas) return invalida();
      const hoje = diaBR();
      const [{ lojas: rs, atualizadoEm }, saldos] = await Promise.all([resultadosPorLoja(lojas, periodo(hoje)), saldosDasLojas(cfg)]);
      return relatorioPlataforma(pl, hoje, hoje, rs, saldos, atualizadoEm ? horaBR(atualizadoEm) : undefined);
    }
    case 'recargas': {
      const ini = inicioDoMes(diaBR());
      const deps = await depositosDoPeriodo(cfg, lerEstado(), ini, diaBR());
      if (n === 1) return relatorioRecargas(deps, cfg.lojas, ini, diaBR(), 'todas as lojas');
      if (n === 2) { ir(s, 'recargas_loja'); return menuLojas(cfg.lojas); }
      if (n === 3) return relatorioRecargas(deps.filter((d) => d.plataforma === 'meta'), cfg.lojas, ini, diaBR(), 'apenas Meta');
      if (n === 4) return relatorioRecargas(deps.filter((d) => d.plataforma === 'google'), cfg.lojas, ini, diaBR(), 'apenas Google');
      return invalida();
    }
    case 'recargas_loja': {
      const loja = cfg.lojas[n - 1];
      if (!loja) return invalida();
      const ini = inicioDoMes(diaBR());
      const deps = await depositosDoPeriodo(cfg, lerEstado(), ini, diaBR());
      return relatorioRecargas(deps.filter((d) => d.loja.id === loja.id), [loja], ini, diaBR(), loja.nome);
    }
    default: return invalida();
  }
}

// Hook chamado pelo whatsappService para TODA mensagem recebida na sessao da central.
export async function tratarMensagemCentral(usuarioId: string, msg: any) {
  const cfg = configCentral();
  const jid = String(msg?.key?.remoteJid || '');
  const sock = wa().sessions.get(usuarioId);
  const numero = await numeroDoRemetente(sock, msg);
  const texto = String(msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '').trim();
  if (!autorizado(cfg, numero)) {
    registrarLog('ignorado', { numero: numero || jid, motivo: 'numero nao autorizado' });
    return;
  }
  if (!texto) return;
  const s = sessaoDe(jid);
  s.em = Date.now();
  registrarLog('comando', { numero, texto: texto.slice(0, 80), tela: s.tela });
  try {
    await responder(usuarioId, jid, await executar(cfg, s, texto));
  } catch (e: any) {
    console.error('[Central] erro ao responder comando:', e?.message || e);
    registrarLog('erro', { numero, texto: texto.slice(0, 80), erro: String(e?.message || e).slice(0, 200) });
    await responder(usuarioId, jid, '⚠️ Não consegui montar essa consulta agora. Tente de novo em alguns minutos.').catch(() => {});
  }
}

// ── Agendamento: relatorio das 8h + monitor de saldo/depositos ──
const conectada = (cfg: ConfigCentral) => !!cfg.usuarioIdRemetente && wa().connectedUsers?.has(cfg.usuarioIdRemetente) && wa().sessions.has(cfg.usuarioIdRemetente);
let enviandoDiario = false;
async function rodarRelatorioDiario() {
  const cfg = configCentral();
  if (!cfg.ativo || enviandoDiario || !cfg.numerosAutorizados.length) return;
  const hora = horaBR();
  // Janela de 4h a partir do horario: se o servidor estava fora as 8h, ainda manda (atrasado), mas nao a tarde.
  const [h, m] = cfg.horaRelatorio.split(':').map(Number);
  const min = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
  const alvo = (h || 0) * 60 + (m || 0);
  if (min < alvo || min > alvo + 240) return;
  const hoje = diaBR();
  const estado = lerEstado();
  const pendentes = cfg.numerosAutorizados.filter((n) => estado.relatorioDiario[n] !== hoje);
  if (!pendentes.length || !conectada(cfg)) return;
  enviandoDiario = true;
  try {
    const blocos = await montarRelatorioDiario(cfg);
    for (const numero of pendentes) {
      const ok = await enviarParaNumero(cfg, numero, blocos);
      registrarLog('relatorio_diario', { numero, dia: somarDias(hoje, -1), ok });
      if (ok) { const e = lerEstado(); e.relatorioDiario[numero] = hoje; gravarEstado(e); }
    }
  } catch (e: any) {
    console.error('[Central] erro no relatorio diario:', e?.message || e);
    registrarLog('erro', { etapa: 'relatorio_diario', erro: String(e?.message || e).slice(0, 200) });
  } finally {
    enviandoDiario = false;
  }
}

const ORDEM_NIVEL: Record<string, number> = { desconhecido: 0, normal: 0, atencao: 1, critico: 2 };
let monitorando = false;
async function rodarMonitorSaldo() {
  const cfg = configCentral();
  // Central desligada nao escreve nada (nem deposito detectado).
  if (monitorando || !cfg.ativo || !cfg.lojas.length) return;
  monitorando = true;
  try {
    const estado = lerEstado();
    const novos = await detectarDepositos(cfg, estado);
    for (const d of novos) registrarLog('deposito_detectado', { loja: d.loja.nome, plataforma: d.plataforma, valor: d.valor });
    gravarEstado(estado);
    if (!cfg.numerosAutorizados.length || !conectada(cfg)) return;
    const hora = horaBR();
    if (hora < cfg.alertas.inicio || hora >= cfg.alertas.fim) return;
    const saldos = await saldosDasLojas(cfg);
    for (const s of saldos) {
      const ant = estado.alertas[s.contaId];
      const nivel = ORDEM_NIVEL[s.nivel] || 0;
      if (nivel === 0) { if (ant) { delete estado.alertas[s.contaId]; gravarEstado(estado); } continue; }
      const piorou = !ant || nivel > (ORDEM_NIVEL[ant.nivel] || 0);
      const repetir = !!ant && Date.now() - ant.enviadoEm >= cfg.alertas.repetirHoras * 3600_000;
      if (!piorou && !repetir) continue;
      const texto = alertaSaldo(s);
      let algum = false;
      for (const numero of cfg.numerosAutorizados) algum = (await enviarParaNumero(cfg, numero, [texto])) || algum;
      registrarLog('alerta_saldo', { loja: s.loja.nome, plataforma: s.plataforma, nivel: s.nivel, saldo: s.saldo, ok: algum });
      if (algum) { estado.alertas[s.contaId] = { nivel: s.nivel, enviadoEm: Date.now() }; gravarEstado(estado); }
    }
  } catch (e: any) {
    console.error('[Central] erro no monitor de saldo:', e?.message || e);
  } finally {
    monitorando = false;
  }
}

export function iniciarCentralTrafego() {
  // 1a rodada do monitor 10 min depois do boot: o sync de anuncios (90 s apos o boot) ja atualizou os saldos.
  setTimeout(() => { rodarMonitorSaldo().catch(() => {}); setInterval(() => rodarMonitorSaldo().catch(() => {}), 15 * 60_000); }, 10 * 60_000);
  setInterval(() => rodarRelatorioDiario().catch(() => {}), 60_000);
  console.log('[Central] Central de Tráfego iniciada (relatório diário, comandos e monitor de saldo).');
}
