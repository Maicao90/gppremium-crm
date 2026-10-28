import fs from 'fs';
import path from 'path';
import { prisma } from '../server';
import { enviarEmailGarantia } from './garantiaEmail';

// ===== Avisos automáticos da Garantia (push + e-mail) =====
// Textos editáveis pelo master no painel (aba "Avisos automáticos"), guardados em
// data/garantia-avisos.json — SEM mudar o banco. O que não está no arquivo usa o default
// daqui. Cada aviso pode ser desligado (ativo=false → a notificação nem é criada).
//
// Título e vistoriaId SEM coluna nova: ficam num cabeçalho dentro de GarantiaNotificacao.mensagem:
//   "\u0001{"t":"<título>","v":"<vistoriaId>","e":1}\u0001<texto>"
// (t = título já com placeholders trocados; v = id da vistoria do aviso vistoria_entrada;
// e = e-mail ainda pendente, só pra aviso agendado pro futuro). lerMensagem() separa —
// painel, app e push NUNCA veem o cabeçalho. Notificação antiga (sem cabeçalho) continua
// funcionando: título cai no padrão do tipo.

export const TIPOS_AVISO = [
  'garantia_cadastrada', 'garantia_aprovada', 'garantia_cancelada', 'revisao_aprovada',
  'revisao_proxima', 'pneu_cancelado', 'vistoria_entrada', 'boas_vindas',
] as const;
export type TipoAviso = typeof TIPOS_AVISO[number] | 'aviso';

const BASE_PLACEHOLDERS = ['{nome}', '{placa}', '{veiculo}'];

type Padrao = { rotulo: string; descricao: string; titulo: string; mensagem: string; email: boolean; placeholders: string[] };
const PADROES: Record<string, Padrao> = {
  garantia_cadastrada: {
    rotulo: 'Garantia cadastrada',
    descricao: 'Quando a loja cadastra a garantia (fica em análise).',
    titulo: 'Recebemos o cadastro da sua garantia! 🛞',
    mensagem: 'Olá {nome}! A garantia dos pneus do seu {veiculo} (placa {placa}) foi registrada e está em análise. Avisaremos quando for ativada.',
    email: true,
    placeholders: [...BASE_PLACEHOLDERS, '{km}', '{kmMaximo}', '{loja}', '{intervaloKm}'],
  },
  garantia_aprovada: {
    rotulo: 'Garantia ativada',
    descricao: 'Quando a GP Premium aprova a garantia na auditoria.',
    titulo: 'Sua garantia foi ativada! ✅',
    mensagem: 'Olá {nome}! A garantia dos pneus do seu {veiculo} (placa {placa}) está ativa: cobertura até {kmMaximo} km ou 2 anos, o que vier primeiro. Faça a revisão gratuita a cada {intervaloKm} km numa loja GP Premium.',
    email: true,
    placeholders: [...BASE_PLACEHOLDERS, '{km}', '{kmMaximo}', '{loja}', '{intervaloKm}'],
  },
  garantia_cancelada: {
    rotulo: 'Garantia cancelada / não aprovada',
    descricao: 'Quando a garantia é reprovada, cancelada ou uma revisão é reprovada. {motivo} explica o porquê.',
    titulo: 'Aviso sobre sua garantia GP Premium',
    mensagem: 'Olá {nome}. A garantia dos pneus do seu {veiculo} (placa {placa}) foi cancelada. {motivo} Procure uma loja credenciada GP Premium para mais informações.',
    email: true,
    placeholders: [...BASE_PLACEHOLDERS, '{motivo}', '{kmMaximo}', '{intervaloKm}'],
  },
  revisao_aprovada: {
    rotulo: 'Revisão aprovada',
    descricao: 'Quando a GP Premium aprova uma revisão na auditoria.',
    titulo: 'Revisão aprovada! ✅',
    mensagem: 'Olá {nome}! A revisão de {km} km do seu {veiculo} (placa {placa}) foi aprovada. Sua garantia GP Premium continua em dia.',
    email: false,
    placeholders: [...BASE_PLACEHOLDERS, '{km}', '{kmMaximo}', '{loja}', '{intervaloKm}'],
  },
  revisao_proxima: {
    rotulo: 'Lembrete da próxima revisão',
    descricao: 'Agendado pelo km/dia do carro para o dia previsto da próxima revisão.',
    titulo: 'Hora da revisão dos seus pneus 🛞',
    mensagem: 'Olá {nome}! Seu {veiculo} (placa {placa}) está chegando na próxima revisão de garantia. Leve o carro a uma loja GP Premium a cada {intervaloKm} km e faça o rodízio dos pneus GRATUITAMENTE para manter sua garantia.',
    email: false,
    placeholders: [...BASE_PLACEHOLDERS, '{kmMaximo}', '{intervaloKm}'],
  },
  pneu_cancelado: {
    rotulo: 'Pneu cancelado',
    descricao: 'Quando a revisão encontra arrancamento de borracha e a garantia daquele pneu é cancelada.',
    titulo: 'Aviso sobre um pneu da sua garantia',
    mensagem: 'Atenção, {nome}: na revisão do seu {veiculo} (placa {placa}) identificamos marcas de arrancamento de borracha no {pneu}. Conforme o termo de garantia GP Premium, a garantia de durabilidade deste pneu foi cancelada.',
    email: false,
    placeholders: [...BASE_PLACEHOLDERS, '{pneu}', '{km}', '{loja}'],
  },
  vistoria_entrada: {
    rotulo: 'Vistoria de entrada',
    descricao: 'Quando a loja faz a vistoria de entrada de um carro que tem cadastro no app.',
    titulo: 'Seu carro deu entrada na oficina 🔧',
    mensagem: 'Olá {nome}! Seu {veiculo} (placa {placa}) deu entrada na {loja}. Abra o app e veja as fotos de como ele chegou.',
    email: true,
    placeholders: [...BASE_PLACEHOLDERS, '{km}', '{loja}'],
  },
  boas_vindas: {
    rotulo: 'Boas-vindas (só e-mail)',
    descricao: 'E-mail enviado quando o cliente cria a conta no app.',
    titulo: 'Bem-vindo à GP Premium! 🛞',
    mensagem: 'Olá {nome}! Obrigado pelo cadastro no app Pneus GP Premium. Por aqui você acompanha a garantia dos seus pneus, as revisões e as vistorias do seu carro. Qualquer dúvida, fale com uma loja GP Premium.',
    email: true,
    placeholders: ['{nome}'],
  },
};
// Disparo manual sem título → usa este.
export const TITULO_AVISO_MANUAL = 'GP Premium 🛞';
// Título de notificação ANTIGA (sem cabeçalho) cujo tipo não tem padrão acima.
const TITULO_LEGADO: Record<string, string> = {
  garantia_expira: 'Sua garantia GP Premium está terminando',
  aviso: TITULO_AVISO_MANUAL,
  odometro_suspeito: 'Odômetro suspeito',
};

export type Aviso = { tipo: string; rotulo: string; descricao: string; ativo: boolean; titulo: string; mensagem: string; email: boolean; placeholders: string[] };

const ARQUIVO = path.join(__dirname, '../../data/garantia-avisos.json');
let cache: { mtime: number; dados: Record<string, any> } | null = null;

function lerArquivo(): Record<string, any> {
  try {
    const st = fs.statSync(ARQUIVO);
    if (cache && cache.mtime === st.mtimeMs) return cache.dados;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    cache = { mtime: st.mtimeMs, dados: dados && typeof dados === 'object' ? dados : {} };
    return cache.dados;
  } catch {
    return {};
  }
}

export function getAviso(tipo: string): Aviso | null {
  const p = PADROES[tipo];
  if (!p) return null;
  const s = lerArquivo()[tipo] || {};
  return {
    tipo, rotulo: p.rotulo, descricao: p.descricao, placeholders: p.placeholders,
    ativo: typeof s.ativo === 'boolean' ? s.ativo : true,
    titulo: typeof s.titulo === 'string' && s.titulo.trim() ? s.titulo : p.titulo,
    mensagem: typeof s.mensagem === 'string' && s.mensagem.trim() ? s.mensagem : p.mensagem,
    email: typeof s.email === 'boolean' ? s.email : p.email,
  };
}

export function listarAvisos(): Aviso[] {
  return TIPOS_AVISO.map((t) => getAviso(t) as Aviso);
}

// Grava SÓ o que mudou em relação ao padrão (assim um texto padrão melhorado no código chega
// em quem nunca editou). Escrita atômica (tmp + rename).
export function salvarAviso(tipo: string, mud: { ativo?: any; titulo?: any; mensagem?: any; email?: any }): Aviso {
  const p = PADROES[tipo];
  if (!p) throw new Error('Tipo de aviso inválido.');
  const todos = { ...lerArquivo() };
  const atual = { ...(todos[tipo] || {}) };
  if (mud.ativo !== undefined) atual.ativo = Boolean(mud.ativo);
  if (mud.email !== undefined) atual.email = Boolean(mud.email);
  if (mud.titulo !== undefined) {
    const t = String(mud.titulo || '').trim().slice(0, 120);
    if (!t) throw new Error('O título não pode ficar vazio.');
    atual.titulo = t;
  }
  if (mud.mensagem !== undefined) {
    const m = String(mud.mensagem || '').replace(/\u0001/g, '').trim().slice(0, 1000);
    if (!m) throw new Error('A mensagem não pode ficar vazia.');
    atual.mensagem = m;
  }
  if (atual.titulo === p.titulo) delete atual.titulo;
  if (atual.mensagem === p.mensagem) delete atual.mensagem;
  if (atual.email === p.email) delete atual.email;
  if (atual.ativo === true) delete atual.ativo;
  if (Object.keys(atual).length) todos[tipo] = atual; else delete todos[tipo];
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(todos, null, 2));
  fs.renameSync(tmp, ARQUIVO);
  cache = null;
  return getAviso(tipo) as Aviso;
}

// ---------- Cabeçalho dentro de `mensagem` ----------
const SEP = '\u0001';
export type MetaMensagem = { t?: string | undefined; v?: string | undefined; e?: number | undefined };

export function montarMensagem(texto: string, meta: MetaMensagem): string {
  const limpo = String(texto || '').replace(/\u0001/g, '');
  const m: MetaMensagem = {};
  if (meta.t) m.t = String(meta.t).replace(/\u0001/g, '');
  if (meta.v) m.v = String(meta.v);
  if (meta.e) m.e = 1;
  return Object.keys(m).length ? `${SEP}${JSON.stringify(m)}${SEP}${limpo}` : limpo;
}

export function lerMensagem(bruta: string): { texto: string; meta: MetaMensagem } {
  const s = String(bruta || '');
  if (s.startsWith(SEP)) {
    const fim = s.indexOf(SEP, 1);
    if (fim > 0) {
      let meta: MetaMensagem = {};
      try { meta = JSON.parse(s.slice(1, fim)) || {}; } catch { meta = {}; }
      return { texto: s.slice(fim + 1), meta };
    }
  }
  return { texto: s, meta: {} };
}

// Título a mostrar (app/push/painel): o gravado no cabeçalho ou o padrão do tipo.
export function tituloDaNotificacao(tipo: string, mensagemBruta: string): string {
  const { meta } = lerMensagem(mensagemBruta);
  if (meta.t) return meta.t;
  return TITULO_LEGADO[tipo] || PADROES[tipo]?.titulo || 'GP Premium';
}

// Notificação para o painel/app: tira o cabeçalho e acrescenta `titulo` (+ vistoriaId se houver).
export function notificacaoSaida<T extends { tipo: string; mensagem: string }>(n: T): T & { titulo: string; vistoriaId?: string } {
  const { texto, meta } = lerMensagem(n.mensagem);
  return { ...n, mensagem: texto, titulo: meta.t || tituloDaNotificacao(n.tipo, ''), ...(meta.v ? { vistoriaId: meta.v } : {}) };
}

// ---------- Placeholders ----------
export type Contexto = {
  nome?: string; placa?: string; veiculo?: string; km?: number | null; kmMaximo?: number | null;
  loja?: string; intervaloKm?: number | null; motivo?: string; pneu?: string;
};
const fmtKm = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR') : '');
const primeiroNome = (s: string) => String(s || '').trim().split(/\s+/)[0] || '';
const placaFmt = (p: string) => {
  const s = String(p || '').toUpperCase();
  return /^[A-Z]{3}\d{4}$/.test(s) ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
};

export function preencher(texto: string, ctx: Contexto): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(ctx.nome || '') || 'cliente',
    placa: placaFmt(ctx.placa || ''),
    veiculo: (ctx.veiculo || '').trim() || 'carro',
    km: fmtKm(ctx.km),
    kmMaximo: fmtKm(ctx.kmMaximo),
    loja: (ctx.loja || '').trim() || 'loja GP Premium',
    intervaloKm: fmtKm(ctx.intervaloKm),
    motivo: (ctx.motivo || '').trim(),
    pneu: (ctx.pneu || '').trim() || 'pneu',
  };
  return String(texto || '')
    .replace(/\{(\w+)\}/g, (m: string, k: string) => valores[k] ?? m)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .trim();
}

// ---------- Criação de aviso ----------
const hojeStr = () => new Date().toISOString().slice(0, 10);
const nomeVeiculo = (v: { marca?: string | null; modelo?: string | null } | null | undefined) =>
  v ? [v.marca, v.modelo].map((s) => String(s || '').trim()).filter(Boolean).join(' ') : '';

// Monta o contexto padrão a partir da garantia (cliente, veículo, loja, config).
export async function contextoDaGarantia(garantiaId: string, extra: Contexto = {}): Promise<{ clienteId: string; ctx: Contexto } | null> {
  const g = await prisma.garantia.findUnique({ where: { id: garantiaId } });
  if (!g) return null;
  const [cliente, veiculo, loja, cfg] = await Promise.all([
    prisma.garantiaCliente.findUnique({ where: { id: g.clienteId }, select: { nome: true } }),
    prisma.garantiaVeiculo.findUnique({ where: { id: g.veiculoId }, select: { placa: true, marca: true, modelo: true } }),
    g.lojaId ? prisma.loja.findUnique({ where: { id: g.lojaId }, select: { store_name: true } }) : Promise.resolve(null),
    prisma.garantiaConfig.findUnique({ where: { id: 'global' } }),
  ]);
  return {
    clienteId: g.clienteId,
    ctx: {
      nome: cliente?.nome || '', placa: veiculo?.placa || '', veiculo: nomeVeiculo(veiculo),
      km: g.kmInicial, kmMaximo: g.kmMaximo, loja: loja?.store_name || '',
      intervaloKm: cfg?.intervaloRevisaoKm ?? 5000,
      ...extra,
    },
  };
}

// Cria a notificação de um aviso automático (se estiver ligado) e manda o e-mail (se o aviso
// tem e-mail ligado e o cliente tem e-mail). Devolve a notificação criada ou null (desligado).
// E-mail: aviso pra HOJE sai na hora (assíncrono, não trava a rota); aviso AGENDADO (ex.:
// revisao_proxima) guarda e=1 no cabeçalho e o worker de push manda no dia.
export async function criarAviso(params: {
  tipo: string; clienteId: string; garantiaId?: string | undefined; ctx: Contexto; agendadaPara?: string | undefined; vistoriaId?: string | undefined;
}) {
  const aviso = getAviso(params.tipo);
  if (!aviso || !aviso.ativo) return null;
  const agendadaPara = params.agendadaPara || hojeStr();
  const titulo = preencher(aviso.titulo, params.ctx);
  const texto = preencher(aviso.mensagem, params.ctx);
  const futuro = agendadaPara > hojeStr();
  const notif = await prisma.garantiaNotificacao.create({
    data: {
      clienteId: params.clienteId,
      garantiaId: params.garantiaId || '',
      tipo: params.tipo,
      agendadaPara,
      mensagem: montarMensagem(texto, { t: titulo, v: params.vistoriaId, e: aviso.email && futuro ? 1 : 0 }),
    },
  });
  if (aviso.email && !futuro) emailParaCliente(params.clienteId, titulo, texto);
  return notif;
}

// E-mail fire-and-forget pro cliente (sem e-mail cadastrado → nada). Nunca lança.
export function emailParaCliente(clienteId: string, titulo: string, texto: string): void {
  (async () => {
    const c = await prisma.garantiaCliente.findUnique({ where: { id: clienteId }, select: { email: true } });
    if (!c?.email) return;
    await enviarEmailGarantia({ para: c.email, assunto: titulo, titulo, texto });
  })().catch((e) => console.error('[garantiaAvisos] e-mail falhou:', e?.message));
}

// E-mail de boas-vindas (só e-mail, sem notificação). Respeita ativo/email do aviso.
export function emailBoasVindas(cliente: { nome: string; email: string }): void {
  const aviso = getAviso('boas_vindas');
  if (!aviso || !aviso.ativo || !aviso.email || !cliente.email) return;
  const ctx = { nome: cliente.nome };
  enviarEmailGarantia({ para: cliente.email, assunto: preencher(aviso.titulo, ctx), titulo: preencher(aviso.titulo, ctx), texto: preencher(aviso.mensagem, ctx) })
    .catch((e) => console.error('[garantiaAvisos] boas-vindas falhou:', e?.message));
}

// Chamado pelo worker: e-mails de avisos AGENDADOS que venceram (e=1 no cabeçalho). Tira o
// e=1 ANTES de mandar (não repete se o envio falhar — e-mail é complemento do push).
export async function enviarEmailsAgendadosDevidos(): Promise<void> {
  const devidas = await prisma.garantiaNotificacao.findMany({
    where: { agendadaPara: { lte: hojeStr() }, mensagem: { startsWith: SEP, contains: '"e":1' } },
    take: 200,
  });
  for (const n of devidas) {
    const { texto, meta } = lerMensagem(n.mensagem);
    if (!meta.e) continue;
    await prisma.garantiaNotificacao.update({ where: { id: n.id }, data: { mensagem: montarMensagem(texto, { t: meta.t, v: meta.v }) } });
    const aviso = getAviso(n.tipo);
    if (aviso && aviso.ativo && aviso.email) emailParaCliente(n.clienteId, meta.t || tituloDaNotificacao(n.tipo, ''), texto);
  }
}
