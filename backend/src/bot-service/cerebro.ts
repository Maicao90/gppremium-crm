import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import { chaveDoFluxo, ehChaveAnthropic, extrairEstruturadoAnthropic } from '../services/llmAnthropic';
import { CATALOGO_FLUXO, GRUPOS_FLUXO, CategoriaFluxo } from '../data/fluxoCatalogo';
import { rotaLerFoto } from './lerFoto';

// CEREBRO DO ROBO (22/10, pedido do dono): ensinamentos ("quando o cliente X, faca Y") que o dono escreve no painel
// ou aprova a partir da revisao diaria das conversas (scripts/cerebro-revisao.ts). O robo so muda com aprovacao do
// dono — nada se ensina sozinho. Tudo fica em data/cerebro/ (este servico e sem banco).
const PASTA = path.resolve(__dirname, '../../data/cerebro');
const ARQ_LICOES = path.join(PASTA, 'licoes.json');
const PASTA_REVISOES = path.join(PASTA, 'revisoes');
const ARQ_TRAVA = path.join(PASTA, 'revisao-rodando.json');
const ARQ_LOJAS = path.resolve(__dirname, '../../data/bot-lojas.json');
// Aprendizado da Josy (22/10): propostas tiradas das conversas da atendente, cada uma esperando o dono aprovar.
const ARQ_APRENDIZADO = path.join(PASTA, 'aprendizado-josy.json');
// Audios: os da Josy ja estao em public/midias/<arquivo>.ogg; o worker so manda o que esta em public/midias/bot-audios/.
const PASTA_MIDIAS = path.resolve(__dirname, '../../public/midias');
const PASTA_AUDIOS_BOT = path.join(PASTA_MIDIAS, 'bot-audios');

export type AcaoLicao = 'responder' | 'atendente' | 'silencio' | 'orientar';
export interface Licao {
  id: string;
  situacao: string;          // "quando o cliente perguntar se entrega em casa"
  acao: AcaoLicao;           // responder com o texto | passar pra atendente | nao responder | orientar a IA
  resposta: string;          // texto (uma bolha por paragrafo) ou orientacao pra IA
  lojas: string[];           // ids de loja (bot-lojas.json); vazio = todas
  ativo: boolean;
  origem: 'dono' | 'revisao' | 'josy';
  criadoEm: string;
  atualizadoEm: string;
  usos: number;
  ultimoUso?: string | undefined;
  ligadoA?: string | undefined; // no do "Mapa do cerebro" onde o dono ensinou (ex.: 'categoria:remold'); so pra desenhar
  propostaJosy?: string | undefined; // id da proposta do "Aprendizado da Josy" que virou este ensinamento
  audioJosy?: string | undefined;    // nome do audio em public/midias/bot-audios (sem .ogg), quando foi aprovado com audio
}

function lerJson<T>(arq: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')) as T; } catch { return padrao; }
}
// Escrita atomica: grava num temporario (nome unico) e renomeia — quem le nunca pega arquivo pela metade.
function gravarJson(arq: string, dados: unknown) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
    fs.renameSync(tmp, arq);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ja foi */ }
    throw e;
  }
}

export function lerLicoes(): Licao[] { return lerJson<Licao[]>(ARQ_LICOES, []); }
function salvarLicoes(l: Licao[]) { gravarJson(ARQ_LICOES, l); }

function lojasDoRobo(): Array<{ id: string; nome: string }> {
  const j = lerJson<Record<string, any>>(ARQ_LOJAS, {});
  return Object.entries(j).filter(([k]) => !k.startsWith('_')).map(([id, v]) => ({ id, nome: String(v?.NOME_LOJA || id) }));
}

export function licoesAtivasDaLoja(nomeLoja?: string | null): Licao[] {
  const loja = lojasDoRobo().find((l) => nomeLoja && l.nome === nomeLoja);
  return lerLicoes().filter((l) => l.ativo && (!l.lojas.length || (loja && l.lojas.includes(loja.id))));
}

export function registrarUso(id: string) {
  const l = lerLicoes();
  const x = l.find((i) => i.id === id);
  if (!x) return;
  x.usos = (x.usos || 0) + 1;
  x.ultimoUso = new Date().toISOString();
  salvarLicoes(l);
}

// Decide se as mensagens do cliente sao EXATAMENTE uma das situacoes ensinadas. Na duvida, nenhuma.
export async function casarLicao(mensagensCliente: string[], contexto: string, licoes: Licao[]): Promise<Licao | null> {
  if (!licoes.length || !mensagensCliente.join('').trim()) return null;
  const apiKey = chaveDoFluxo();
  if (!apiKey || !ehChaveAnthropic(apiKey)) return null;
  const lista = licoes.map((l) => `- ${l.id}: ${l.situacao}`).join('\n');
  const bruto = await extrairEstruturadoAnthropic({
    apiKey,
    model: process.env.ANTHROPIC_MODEL_EXTRATOR || 'claude-haiku-5-5',
    system: 'Voce confere se as ultimas mensagens de um cliente de uma loja de pneus se encaixam CLARAMENTE em uma das situacoes que o dono da loja ensinou. So escolha uma situacao se ela descrever exatamente o que o cliente esta pedindo/dizendo agora; na duvida, ou se for outro assunto, responda "nenhuma".',
    usuario: `SITUACOES ENSINADAS:\n${lista}\n\nCONVERSA RECENTE:\n${contexto || '(sem historico)'}\n\nULTIMAS MENSAGENS DO CLIENTE:\n${mensagensCliente.join('\n')}`,
    schema: {
      type: 'object',
      properties: {
        licao: { type: 'string', description: 'id da situacao que se encaixa, ou "nenhuma"' },
        certeza: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      },
      required: ['licao', 'certeza'],
    },
    nomeFerramenta: 'registrar_situacao',
    timeoutMs: 15_000,
  }).catch(() => null);
  if (!bruto) return null;
  try {
    const r = JSON.parse(bruto);
    if (r.certeza === 'baixa') return null;
    return licoes.find((l) => l.id === String(r.licao)) || null;
  } catch { return null; }
}

// Marcador de audio do robo ("[ENVIAR_AUDIO:nome]" ou "[ENVIAR_AUDIO:nome!N]"), igual ao do fluxo/worker.
export const RE_MARCADOR_AUDIO = /^\[ENVIAR_AUDIO:[^\]]+\]$/i;
const paragrafos = (t: string) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

// Bolhas da resposta ensinada: um paragrafo (linha em branco) = uma mensagem.
// comAudio = quem chamou sabe mandar audio (worker manda audioFluxo: true). Sem isso o marcador sai e fica so o
// texto de reserva — o marcador nunca pode chegar ao cliente como mensagem (mesma regra do fluxo, server.ts).
export function partesDaLicao(l: Licao, comAudio = false): string[] {
  const partes = paragrafos(l.resposta).slice(0, 6);
  return comAudio ? partes : partes.filter((p) => !RE_MARCADOR_AUDIO.test(p));
}

// ---------------- API do painel (/api/cerebro) ----------------
type Usuario = { sub: string; role: string; nome?: string };
function usuarioDoToken(req: express.Request): Usuario | null {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = process.env.JWT_SECRET || '';
  if (!token || !s) return null;
  try {
    const d: any = jwt.verify(token, s);
    const nome = String(d.nome || d.name || d.email || '').trim();
    return { sub: String(d.sub), role: String(d.role), ...(nome ? { nome } : {}) };
  } catch { return null; }
}
const ehDono = (u: Usuario | null) => !!u && ['master', 'admin'].includes(u.role);

function revisoesDisponiveis() {
  if (!fs.existsSync(PASTA_REVISOES)) return [];
  return fs.readdirSync(PASTA_REVISOES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(0, 60).map((f) => {
    const r = lerJson<any>(path.join(PASTA_REVISOES, f), {});
    const achados = Array.isArray(r.achados) ? r.achados : [];
    return { data: f.slice(0, 10), conversas: r.conversas || 0, achados: achados.length, pendentes: achados.filter((a: any) => a.status === 'pendente').length, geradoEm: r.geradoEm || null };
  });
}

function revisaoRodando(): any {
  const t = lerJson<any>(ARQ_TRAVA, null);
  if (!t) return null;
  try { process.kill(Number(t.pid), 0); return t; } catch { return null; }
}

function novaLicao(dados: any, origem: Licao['origem']): Licao | string {
  const situacao = String(dados?.situacao || '').trim();
  const acao = String(dados?.acao || '') as AcaoLicao;
  const resposta = String(dados?.resposta || '').trim();
  if (situacao.length < 5) return 'Descreva a situação (quando o cliente...).';
  if (!['responder', 'atendente', 'silencio', 'orientar'].includes(acao)) return 'Escolha o que o robô deve fazer.';
  if ((acao === 'responder' || acao === 'orientar') && resposta.length < 2) return 'Escreva a resposta / orientação.';
  const agora = new Date().toISOString();
  const ligadoA = /^(etapa|categoria):[a-z0-9_]{1,60}$/.test(String(dados?.ligadoA || '')) ? String(dados.ligadoA) : undefined;
  return {
    id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    situacao: situacao.slice(0, 400), acao, resposta: resposta.slice(0, 2000),
    lojas: Array.isArray(dados?.lojas) ? dados.lojas.map(String) : [],
    ativo: dados?.ativo !== false, origem, criadoEm: agora, atualizadoEm: agora, usos: 0,
    ...(ligadoA ? { ligadoA } : {}),
  };
}

// ---------------- APRENDIZADO DA JOSY (22/10, pedido do dono) ----------------
// Trocar a IA livre por respostas FIXAS do jeito que a atendente Josy atende, com os audios dela na hora certa.
// A analise das conversas (/root/josy-analise/sintetizar.mjs) gera data/cerebro/aprendizado-josy.json com uma
// PROPOSTA por situacao. Nada vale no robo sem o dono aprovar: aprovar vira ensinamento (origem 'josy'); com audio, o
// audio dela e copiado pra public/midias/bot-audios/josy-<id>.ogg e a resposta comeca com [ENVIAR_AUDIO:josy-<id>!N]
// (o audio substitui as N mensagens de texto seguintes, que ficam de reserva se o audio falhar).
type StatusProposta = 'pendente' | 'aprovado' | 'ignorado';
interface AudioJosy { midia: string; transcricao?: string; duracao?: number; vezesUsado?: number }
interface PropostaJosy {
  id: string; titulo?: string; quando?: string; frequencia?: number; taxaSucesso?: number | null; comoJosyFaz?: string;
  exemplos?: Array<{ cliente?: string; loja?: string }>; frasesQueFuncionaram?: string[];
  sugestao?: { situacao?: string; acao?: string; resposta?: string; lojas?: string[] };
  ligadoA?: string | null; audios?: AudioJosy[]; status: StatusProposta;
  decididoEm?: string; decididoPor?: string; licaoId?: string; audioEscolhido?: string | null;
  [extra: string]: unknown;
}
interface ArquivoAprendizado { geradoEm?: string | null; conversasLidas?: number; propostas: PropostaJosy[]; [extra: string]: unknown }

const RE_MIDIA_JOSY = /^\/midias\/([A-Za-z0-9_-]{1,120})\.ogg$/; // so /midias/<nome>.ogg: sem "..", sem subpasta
const MAX_TEXTOS_COM_AUDIO = 4; // o worker pula no maximo 4 partes depois do audio (interpretarMarcadorAudio)
const TAM_MAX_AUDIO = 16 * 1024 * 1024;

function lerAprendizado(): { existe: boolean; dados: ArquivoAprendizado } {
  if (!fs.existsSync(ARQ_APRENDIZADO)) return { existe: false, dados: { geradoEm: null, conversasLidas: 0, propostas: [] } };
  const bruto = lerJson<any>(ARQ_APRENDIZADO, null);
  const propostas: PropostaJosy[] = (Array.isArray(bruto?.propostas) ? bruto.propostas : [])
    .filter((p: any) => p && typeof p.id === 'string' && p.id.trim())
    .map((p: any) => ({ ...p, status: ['aprovado', 'ignorado'].includes(p.status) ? p.status : 'pendente' }));
  return { existe: true, dados: { ...(bruto && typeof bruto === 'object' ? bruto : {}), propostas } };
}
function contagemAprendizado(propostas: PropostaJosy[]) {
  const c = { total: propostas.length, pendente: 0, aprovado: 0, ignorado: 0 };
  for (const p of propostas) c[p.status]++;
  return c;
}

// Nome do audio no bot-audios: josy-<id sem acento, so [a-z0-9_-]> (o worker so aceita esses caracteres).
// Se o nome ja for de um ensinamento de OUTRA proposta (ids diferentes so no acento), ganha um sufixo.
function nomeDoAudioJosy(id: string): string {
  const base = String(id).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 6);
  const nome = `josy-${base || hash}`;
  const deOutra = lerLicoes().some((l) => l.audioJosy === nome && l.propostaJosy !== id);
  return deOutra ? `${nome}-${hash}` : nome;
}

// Copia /midias/<x>.ogg -> /midias/bot-audios/<nome>.ogg (copia num temporario e renomeia). Devolve erro ou null.
function copiarAudioJosy(midia: string, nome: string): string | null {
  const m = RE_MIDIA_JOSY.exec(midia);
  if (!m || !/^[a-z0-9_-]+$/.test(nome)) return 'Caminho de áudio inválido.';
  let real: string;
  try { real = fs.realpathSync(path.join(PASTA_MIDIAS, `${m[1]}.ogg`)); } catch { return 'Esse áudio não foi encontrado no servidor.'; }
  // link simbolico apontando pra fora de public/midias nao passa
  if (path.dirname(real) !== fs.realpathSync(PASTA_MIDIAS)) return 'Caminho de áudio inválido.';
  const st = fs.statSync(real);
  if (!st.isFile() || st.size < 200 || st.size > TAM_MAX_AUDIO) return 'Arquivo de áudio inválido.';
  fs.mkdirSync(PASTA_AUDIOS_BOT, { recursive: true });
  const destino = path.join(PASTA_AUDIOS_BOT, `${nome}.ogg`);
  const tmp = `${destino}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try { fs.copyFileSync(real, tmp); fs.renameSync(tmp, destino); }
  catch (e: any) { try { fs.unlinkSync(tmp); } catch { /* ja foi */ } return `Não foi possível copiar o áudio (${String(e?.message || e).slice(0, 80)}).`; }
  return null;
}

// Aprovar (com ou sem audio) ou ignorar uma proposta. Devolve [status http, corpo].
function decidirProposta(id: string, corpo: any, u: Usuario): [number, Record<string, unknown>] {
  const { existe, dados } = lerAprendizado();
  if (!existe) return [404, { error: 'Ainda não tem aprendizado da Josy.' }];
  const p = dados.propostas.find((x) => x.id === id);
  if (!p) return [404, { error: 'Proposta não encontrada.' }];
  if (p.status !== 'pendente') return [409, { error: `Essa proposta já foi ${p.status === 'aprovado' ? 'aprovada' : 'ignorada'}.` }];
  const decisao = String(corpo?.decisao || '');
  let licao: Licao | null = null;
  if (decisao === 'aprovar') {
    const editado = corpo?.licao && typeof corpo.licao === 'object' ? corpo.licao : {};
    const base: Record<string, any> = { ...(p.sugestao || {}), ligadoA: p.ligadoA || undefined };
    for (const k of ['situacao', 'acao', 'resposta', 'lojas']) if (editado[k] !== undefined) base[k] = editado[k];
    const audio = corpo?.audio == null || corpo.audio === '' ? null : String(corpo.audio);
    let nomeAudio: string | null = null;
    // marcador digitado/esquecido no texto nao vale: so o que o dono escolhe aqui vira audio
    const textos = paragrafos(String(base.resposta || '')).filter((x) => !RE_MARCADOR_AUDIO.test(x));
    if (audio) {
      if (!RE_MIDIA_JOSY.test(audio)) return [400, { error: 'Caminho de áudio inválido.' }];
      if (!(p.audios || []).some((a) => a?.midia === audio)) return [400, { error: 'Esse áudio não é desta proposta.' }];
      if (base.acao !== 'responder') return [400, { error: 'Áudio só vai junto quando o robô responde com texto fixo (escolha "Responder com este texto").' }];
      if (!textos.length) return [400, { error: 'Escreva o texto de reserva: ele vai se o áudio falhar.' }];
      if (textos.length > MAX_TEXTOS_COM_AUDIO) return [400, { error: `Com áudio, no máximo ${MAX_TEXTOS_COM_AUDIO} mensagens de texto de reserva.` }];
      nomeAudio = nomeDoAudioJosy(p.id);
      base.resposta = [`[ENVIAR_AUDIO:${nomeAudio}!${textos.length}]`, ...textos].join('\n\n');
    } else if (base.acao === 'responder') {
      base.resposta = textos.join('\n\n');
    }
    if (String(base.resposta || '').length > 2000) return [400, { error: 'Texto muito comprido (máximo 2000 caracteres).' }];
    const l = novaLicao(base, 'josy');
    if (typeof l === 'string') return [400, { error: l }];
    if (nomeAudio && audio) {
      const erro = copiarAudioJosy(audio, nomeAudio);
      if (erro) return [400, { error: erro }];
      l.audioJosy = nomeAudio;
    }
    l.propostaJosy = p.id;
    const todas = lerLicoes(); todas.push(l); salvarLicoes(todas);
    licao = l;
    Object.assign(p, { status: 'aprovado' as StatusProposta, licaoId: l.id, audioEscolhido: audio, acaoAprovada: l.acao, respostaAprovada: l.resposta });
  } else if (decisao === 'ignorar') {
    p.status = 'ignorado';
  } else return [400, { error: 'Decisão inválida (aprovar ou ignorar).' }];
  p.decididoEm = new Date().toISOString();
  p.decididoPor = u.nome || u.sub;
  gravarJson(ARQ_APRENDIZADO, dados);
  return [200, { ok: true, proposta: p, ...(licao ? { licao } : {}) }];
}

// ---------------- MAPA DO CEREBRO (22/10, pedido do dono: "todo interativo, tipo com neuronios") ----------------
// Neuronios = etapas do atendimento, blocos do fluxo (fluxoCatalogo), ensinamentos do dono e achados pendentes da
// revisao. Sinapses = caminhos reais das conversas (bloco -> proximo bloco na mesma conversa), contados no rastro
// FluxoEvento (so SELECT, banco em modo somente-leitura) e, se o banco falhar, so no fim do bot-service.log.
// A contagem fica em cache 5 min; ensinamentos e achados sao lidos na hora (arquivo pequeno).
const ARQ_LOG_BOT = process.env.CEREBRO_LOG_BOT || '/root/whatsapp-crm/logs/bot-service.log';
const CACHE_USO_MS = 5 * 60 * 1000;

type TipoNo = 'etapa' | 'categoria' | 'ensinamento' | 'achado' | 'aprendizado';
interface NoMapa {
  id: string; tipo: TipoNo; rotulo: string; descricao: string; usosHoje: number; usos7d: number; acao: string; ativo: boolean;
  etapa?: string; extra?: Record<string, unknown>;
}
interface LigacaoMapa { de: string; para: string; peso: number; tipo: 'etapa' | 'pertence' | 'caminho' | 'ensina' | 'achado' | 'aprendizado' }
type Contagem = { hoje: number; d7: number };
interface UsoMapa {
  fonte: 'rastro' | 'log' | 'nenhuma'; erro?: string; desde: string | null;
  mensagens: Contagem; viaFluxo: number; viaLivre: number;
  porChave: Record<string, Contagem>; transicoes: Record<string, number>; motivosLivre: Record<string, number>;
  porLicao: Record<string, Contagem>; textosEditados: Record<string, Array<{ loja: string; partes: string[] }>>;
  // respostas do robo nas conversas que a revisao apontou (pra ligar cada achado ao bloco que respondeu de verdade)
  eventosDosAchados: Record<string, Array<{ chaves: string[]; texto: string }>>;
}
const normalizar = (t: string) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

const ETAPAS_MAPA: Array<{ id: string; rotulo: string; descricao: string }> = [
  { id: 'abertura', rotulo: 'Abertura', descricao: 'O cliente chega (clique no anúncio, "oi", "bom dia"). O robô cumprimenta e já puxa a medida.' },
  { id: 'medida', rotulo: 'Medida / carro', descricao: 'Descobrir a medida do pneu (ou o carro). Sem medida não tem preço; medida que a loja não tem vira alternativa do mesmo aro.' },
  { id: 'preco', rotulo: 'Preço', descricao: 'Preço da tabela, parcelamento, juros, desconto e promoção. Número sempre sai da tabela de preços, nunca de texto fixo.' },
  { id: 'objecoes', rotulo: 'Dúvidas e objeções', descricao: 'Remold, chinês, garantia, outra marca, "tá caro", serviços e políticas da loja.' },
  { id: 'fechamento', rotulo: 'Fechamento / visita', descricao: 'Localização, horário, "vou passar aí" (o robô agenda os lembretes) e a despedida.' },
  { id: 'atendente', rotulo: 'Atendente humana', descricao: 'Onde o robô não decide sozinho: IA livre (assunto sem bloco pronto), "só um instante" pra atendente, e quem o robô não responde (fornecedor, equipe).' },
];
// Caminho "normal" de uma conversa (desenho de base; o peso real vem das conversas).
const CAMINHO_ETAPAS: Array<[string, string]> = [['abertura', 'medida'], ['medida', 'preco'], ['preco', 'objecoes'], ['objecoes', 'fechamento'], ['preco', 'fechamento'], ['objecoes', 'atendente'], ['medida', 'atendente']];
const ETAPA_DO_GRUPO: Record<string, string> = { preco: 'medida', pagamento: 'preco', produto: 'objecoes', servicos: 'objecoes', loja: 'fechamento', objecao: 'objecoes', filtro: 'atendente' };
const ETAPA_DA_CHAVE: Record<string, string> = {
  saudacao: 'abertura', saudacao_retorno: 'abertura',
  pedir_medida: 'medida', pedir_medida_repetida: 'medida', medida_inexistente: 'medida', sem_alternativa: 'medida', aro_sem_medida: 'medida',
  preco_medida: 'preco', promocao_leve4: 'preco',
  agradecimento: 'fechamento', localizacao: 'fechamento', localizacao_repetida: 'fechamento', horario: 'fechamento', visita_confirmada: 'fechamento', visita_sem_dia: 'fechamento',
  foto: 'objecoes', servico_oficina: 'objecoes', ia_livre: 'atendente',
};
// sem_alternativa tambem e o que sai quando um ensinamento manda "passar pra atendente" ("so um instante" + etiqueta).
const LIGACOES_EXTRAS: Array<[string, string]> = [['sem_alternativa', 'atendente']];
const ROTULO_ACAO: Record<string, string> = { responder: 'Responde com o texto do dono', atendente: 'Passa pra atendente', silencio: 'Não responde', orientar: 'Orienta a IA' };
const ROTULO_MOTIVO: Record<string, string> = { assunto_sem_bloco: 'assunto sem bloco pronto', midia_sem_texto: 'foto/áudio sem texto', cortada_pelas_travas: 'resposta cortada pelas travas' };

const etapaDaChave = (chave: string, grupo?: string) => ETAPA_DA_CHAVE[chave] || (grupo && ETAPA_DO_GRUPO[grupo]) || 'objecoes';
const inicioDoDiaBR = () => { const d = new Date(Date.now() - 3 * 3600e3); d.setUTCHours(0, 0, 0, 0); return d.getTime() + 3 * 3600e3; };
const curto = (s: string, n: number) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const somar = (c: Record<string, Contagem>, k: string, hoje: boolean) => { const x = (c[k] ||= { hoje: 0, d7: 0 }); x.d7++; if (hoje) x.hoje++; };

// Fim do log do bot-service (le so os ultimos ~1 MB): quantas vezes cada ensinamento disparou.
function usoDosEnsinamentosNoLog(): Record<string, Contagem> {
  const porLicao: Record<string, Contagem> = {};
  try {
    const tam = fs.statSync(ARQ_LOG_BOT).size;
    const ler = Math.min(tam, 1024 * 1024);
    const buf = Buffer.alloc(ler);
    const fd = fs.openSync(ARQ_LOG_BOT, 'r');
    try { fs.readSync(fd, buf, 0, ler, tam - ler); } finally { fs.closeSync(fd); }
    const hoje = inicioDoDiaBR(); const semana = Date.now() - 7 * 864e5;
    for (const linha of buf.toString('utf8').split('\n')) {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}): \[BotService\]\[Cerebro\] ensinamento (\S+)/.exec(linha);
      if (!m) continue;
      const quando = Date.parse(`${m[1]}T${m[2]}Z`); // pm2 grava no relogio do servidor (UTC)
      if (!(quando >= semana)) continue;
      somar(porLicao, String(m[3]), quando >= hoje);
    }
  } catch { /* sem log: fica zerado */ }
  return porLicao;
}

// Rastro FluxoEvento dos ultimos 7 dias + textos editados por loja (FluxoResposta). So leitura.
async function usoDoRastro(): Promise<Omit<UsoMapa, 'porLicao'>> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require('pg');
  const cli = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000, query_timeout: 8000, options: '-c default_transaction_read_only=on -c statement_timeout=4000' });
  // sem ouvinte, um 'error' do pg (banco reiniciou / conexao caiu no meio da consulta) vira excecao nao tratada e
  // DERRUBA o bot-service inteiro; com ele, a consulta so falha e o mapa cai na contagem pelo log.
  cli.on('error', (e: any) => console.error('[BotService][Cerebro] mapa: conexao do banco caiu:', String(e?.message || e).slice(0, 160)));
  await cli.connect();
  try {
    const eventos: Array<{ chatJid: string; criadoEm: Date; chaves: string; via: string; motivoLivre: string | null }> = (await cli.query(
      `SELECT "chatJid", "criadoEm", chaves, via, "motivoLivre" FROM "FluxoEvento" WHERE "criadoEm" > now() - interval '7 days' ORDER BY "chatJid", "criadoEm" LIMIT 20000`,
    )).rows;
    const editados: Array<{ chave: string; partes: string }> = (await cli.query(`SELECT chave, partes FROM "FluxoResposta"`)).rows;
    const lojas = lojasDoRobo();
    const textosEditados: UsoMapa['textosEditados'] = {};
    for (const e of editados) {
      const m = /^(?:loja:([^:]+):)?([a-z0-9_]+)$/.exec(e.chave);
      if (!m) continue;
      let partes: string[] = [];
      try { const p = JSON.parse(e.partes); if (Array.isArray(p)) partes = p.map(String); } catch { /* ignora */ }
      const loja = m[1] ? (lojas.find((l) => l.id === m[1])?.nome || 'outra loja') : 'todas as lojas';
      (textosEditados[String(m[2])] ||= []).push({ loja, partes });
    }
    const hoje = inicioDoDiaBR();
    const porChave: Record<string, Contagem> = {}; const transicoes: Record<string, number> = {}; const motivosLivre: Record<string, number> = {};
    const mensagens: Contagem = { hoje: 0, d7: 0 };
    let viaFluxo = 0; let viaLivre = 0; let anterior: { chat: string; quando: number; chave: string } | null = null;
    const ligar = (a: string, b: string) => { if (a !== b) transicoes[`${a}>${b}`] = (transicoes[`${a}>${b}`] || 0) + 1; };
    for (const e of eventos) {
      const quando = new Date(e.criadoEm).getTime(); const ehHoje = quando >= hoje;
      mensagens.d7++; if (ehHoje) mensagens.hoje++;
      let chaves: string[] = [];
      if (e.via === 'ia_livre') { viaLivre++; chaves = ['ia_livre']; motivosLivre[e.motivoLivre || 'outro'] = (motivosLivre[e.motivoLivre || 'outro'] || 0) + 1; }
      else {
        if (e.via === 'fluxo') viaFluxo++;
        try { const c = JSON.parse(e.chaves); if (Array.isArray(c)) chaves = c.map(String).filter((k) => /^[a-z0-9_]+$/.test(k) && !k.startsWith('cerebro')); } catch { /* ignora */ }
      }
      if (!chaves.length) continue;
      for (const k of new Set(chaves)) somar(porChave, k, ehHoje);
      // sinapse: ultimo bloco da resposta anterior (mesma conversa, menos de 24h) -> primeiro bloco desta; e dentro da mesma resposta
      if (anterior && anterior.chat === e.chatJid && quando - anterior.quando < 24 * 3600e3) ligar(anterior.chave, String(chaves[0]));
      for (let i = 1; i < chaves.length; i++) ligar(String(chaves[i - 1]), String(chaves[i]));
      anterior = { chat: e.chatJid, quando, chave: String(chaves[chaves.length - 1]) };
    }
    const primeiro = eventos.reduce<number | null>((min, e) => { const t = new Date(e.criadoEm).getTime(); return min === null || t < min ? t : min; }, null);
    // conversas apontadas na revisao mais recente: o que o robo mandou em cada uma (texto normalizado + blocos)
    const eventosDosAchados: UsoMapa['eventosDosAchados'] = {};
    const chats = [...new Set((revisaoMaisRecente()?.achados || []).map((a) => String(a?.chatJid || '')).filter(Boolean))].slice(0, 80);
    if (chats.length) {
      const linhas: Array<{ chatJid: string; chaves: string; via: string; partes: string }> = (await cli.query(
        `SELECT "chatJid", chaves, via, partes FROM "FluxoEvento" WHERE "chatJid" = ANY($1) AND "criadoEm" > now() - interval '7 days' ORDER BY "criadoEm" LIMIT 2000`, [chats],
      )).rows;
      for (const l of linhas) {
        let chaves: string[] = []; let partes: string[] = [];
        try { const c = JSON.parse(l.chaves); if (Array.isArray(c)) chaves = c.map(String); } catch { /* ignora */ }
        try { const p = JSON.parse(l.partes); if (Array.isArray(p)) partes = p.map(String); } catch { /* ignora */ }
        if (l.via === 'ia_livre') chaves = ['ia_livre'];
        if (chaves.length) (eventosDosAchados[l.chatJid] ||= []).push({ chaves, texto: normalizar(partes.join(' ')).slice(0, 1500) });
      }
    }
    return { fonte: 'rastro', desde: primeiro ? new Date(primeiro).toISOString() : null, mensagens, viaFluxo, viaLivre, porChave, transicoes, motivosLivre, textosEditados, eventosDosAchados };
  } finally {
    await cli.end().catch(() => undefined);
  }
}

let cacheUso: { em: number; dados: UsoMapa } | null = null;
let usoEmAndamento: Promise<UsoMapa> | null = null;
async function usoComCache(): Promise<UsoMapa> {
  if (!cacheUso || Date.now() - cacheUso.em > CACHE_USO_MS) {
    usoEmAndamento ||= usoDoRastro()
      .catch((e: any) => ({
        fonte: 'log' as const, erro: String(e?.message || e).slice(0, 160), desde: null, mensagens: { hoje: 0, d7: 0 }, viaFluxo: 0, viaLivre: 0,
        porChave: {}, transicoes: {}, motivosLivre: {}, textosEditados: {}, eventosDosAchados: {},
      }))
      .then((u) => ({ ...u, porLicao: usoDosEnsinamentosNoLog() }));
    try { cacheUso = { em: Date.now(), dados: await usoEmAndamento }; } finally { usoEmAndamento = null; }
  }
  return cacheUso.dados;
}

// Liga um texto livre (ensinamento / achado) ao bloco do fluxo mais parecido: palavras em comum, com peso maior pras raras.
const PALAVRAS_VAZIAS = new Set('quando cliente clientes perguntar pergunta pergunte perguntou robo responder resposta mensagem mensagens sobre para pela pelo como mais esta esse essa isso que com sem nao sim ele ela eles depois antes ainda tambem loja voce voces gente fazer faz deve dizer fala falar quer querer manda mandar seu sua dele dela'.split(' '));
const raizes = (t: string) => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]+/g, ' ')
  .split(/\s+/).filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)).map((p) => p.slice(0, 6)));
function ligadorPorSemelhanca(catalogo: CategoriaFluxo[]) {
  const docs = catalogo.map((c) => ({ chave: c.chave, r: raizes([c.chave.replace(/_/g, ' '), c.titulo, c.quando, ...(c.exemplos || [])].join(' ')) }));
  const df: Record<string, number> = {};
  for (const d of docs) for (const p of d.r) df[p] = (df[p] || 0) + 1;
  return (texto: string): string | null => {
    const r = raizes(texto); let melhor: string | null = null; let nota = 0;
    for (const d of docs) {
      let s = 0; for (const p of r) if (d.r.has(p)) s += 1 / Math.log(2 + (df[p] || 1));
      if (s > nota) { nota = s; melhor = d.chave; }
    }
    return nota >= 1.5 ? melhor : null; // pelo menos 2 palavras em comum (uma so liga coisa sem nada a ver)
  };
}

function revisaoMaisRecente(): { data: string; achados: any[] } | null {
  if (!fs.existsSync(PASTA_REVISOES)) return null;
  const f = fs.readdirSync(PASTA_REVISOES).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
  if (!f) return null;
  const r = lerJson<any>(path.join(PASTA_REVISOES, f), {});
  return { data: f.slice(0, 10), achados: Array.isArray(r.achados) ? r.achados : [] };
}

export async function montarMapa() {
  const uso = await usoComCache();
  const nos: NoMapa[] = []; const ligacoes: LigacaoMapa[] = [];
  const zero: Contagem = { hoje: 0, d7: 0 };
  const catalogo = [...CATALOGO_FLUXO];
  // blocos que o codigo usa mas ainda nao estao no catalogo da tela Fluxo (ex.: aro_sem_medida) entram tambem
  for (const k of Object.keys(uso.porChave)) {
    if (k !== 'ia_livre' && !catalogo.some((c) => c.chave === k)) {
      catalogo.push({ chave: k, grupo: 'preco', titulo: k.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()), quando: 'Bloco do código que ainda não tem cartão na tela "Fluxo do atendimento".', exemplos: [] });
    }
  }

  // categorias (blocos do fluxo) + a IA livre
  const etapaDe: Record<string, string> = {};
  for (const c of catalogo) {
    const etapa = etapaDaChave(c.chave, c.grupo); etapaDe[c.chave] = etapa;
    const u = uso.porChave[c.chave] || zero;
    const acao = c.silencio ? 'Fica calado: o código decide não responder e a equipe vê no painel.'
      : c.partes?.length ? c.partes.join('\n\n') : c.calculado ? `Calculado pela tabela: ${c.calculado}` : '';
    nos.push({
      id: `categoria:${c.chave}`, tipo: 'categoria', rotulo: c.titulo, descricao: c.quando, usosHoje: u.hoje, usos7d: u.d7, acao, ativo: true, etapa,
      extra: {
        chave: c.chave, grupo: GRUPOS_FLUXO[c.grupo]?.titulo || c.grupo, exemplos: c.exemplos || [], partes: c.partes || [], calculado: c.calculado || null,
        acaoExtra: c.acao || null, silencio: !!c.silencio, audio: c.audio ? { modo: c.audio.modo, transcricao: c.audio.transcricao || null } : null,
        textosLoja: uso.textosEditados[c.chave] || [],
      },
    });
  }
  const livre = uso.porChave.ia_livre || zero; etapaDe.ia_livre = 'atendente';
  nos.push({
    id: 'categoria:ia_livre', tipo: 'categoria', rotulo: 'IA livre (sem bloco pronto)', etapa: 'atendente', ativo: true, usosHoje: livre.hoje, usos7d: livre.d7,
    descricao: 'A mensagem não caiu em nenhum bloco do roteiro e a IA escreveu a resposta sozinha. Cada caso aqui é candidato a virar ensinamento.',
    acao: Object.entries(uso.motivosLivre).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${ROTULO_MOTIVO[m] || m}: ${n}`).join(' · ') || 'Nenhum caso nos últimos 7 dias.',
    extra: { chave: 'ia_livre', motivos: uso.motivosLivre },
  });

  // etapas (soma das categorias de cada uma)
  for (const e of ETAPAS_MAPA) {
    const filhos = nos.filter((n) => n.tipo === 'categoria' && n.etapa === e.id);
    nos.push({
      id: `etapa:${e.id}`, tipo: 'etapa', rotulo: e.rotulo, descricao: e.descricao, etapa: e.id, ativo: true,
      usosHoje: filhos.reduce((s, n) => s + n.usosHoje, 0), usos7d: filhos.reduce((s, n) => s + n.usos7d, 0),
      acao: `${filhos.length} situações nesta etapa`, extra: { ordem: ETAPAS_MAPA.indexOf(e) },
    });
    for (const f of filhos) ligacoes.push({ de: `etapa:${e.id}`, para: f.id, peso: f.usos7d, tipo: 'pertence' });
  }
  for (const [a, b] of LIGACOES_EXTRAS) ligacoes.push({ de: `etapa:${b}`, para: `categoria:${a}`, peso: uso.porChave[a]?.d7 || 0, tipo: 'pertence' });

  // sinapses reais (bloco -> proximo bloco) e, somadas por etapa, o caminho entre etapas
  const entreEtapas: Record<string, number> = {};
  for (const [a, b] of CAMINHO_ETAPAS) entreEtapas[`${a}>${b}`] = 0;
  for (const [par, n] of Object.entries(uso.transicoes)) {
    const [a, b] = par.split('>');
    if (!a || !b || !etapaDe[a] || !etapaDe[b]) continue;
    ligacoes.push({ de: `categoria:${a}`, para: `categoria:${b}`, peso: n, tipo: 'caminho' });
    const ea = etapaDe[a]; const eb = etapaDe[b];
    if (ea && eb && ea !== eb) entreEtapas[`${ea}>${eb}`] = (entreEtapas[`${ea}>${eb}`] || 0) + n;
  }
  for (const [par, n] of Object.entries(entreEtapas)) {
    const [a, b] = par.split('>');
    // caminho de base sempre aparece; etapa voltando pra tras so se aconteceu de verdade
    if (n > 0 || CAMINHO_ETAPAS.some(([x, y]) => x === a && y === b)) ligacoes.push({ de: `etapa:${a}`, para: `etapa:${b}`, peso: n, tipo: 'etapa' });
  }

  // ensinamentos do dono, ligados ao bloco escolhido (ligadoA) ou ao mais parecido; sem parecido = IA livre
  const parecido = ligadorPorSemelhanca(catalogo);
  const idsValidos = new Set(nos.map((n) => n.id));
  for (const l of lerLicoes()) {
    const u = uso.porLicao[l.id] || zero;
    const alvo = l.ligadoA && idsValidos.has(l.ligadoA) ? l.ligadoA : (() => { const k = parecido(`${l.situacao} ${l.resposta}`); return k ? `categoria:${k}` : 'categoria:ia_livre'; })();
    nos.push({
      id: `ensinamento:${l.id}`, tipo: 'ensinamento', rotulo: curto(l.situacao.replace(/^quando o cliente\s*/i, ''), 70), descricao: l.situacao,
      acao: `${ROTULO_ACAO[l.acao] || l.acao}${l.resposta ? `: ${l.resposta}` : ''}`, ativo: !!l.ativo, usosHoje: u.hoje, usos7d: u.d7,
      etapa: nos.find((n) => n.id === alvo)?.etapa || 'atendente', extra: { licao: l, ligadoA: alvo, ligadoAutomatico: !l.ligadoA },
    });
    ligacoes.push({ de: alvo, para: `ensinamento:${l.id}`, peso: Math.max(1, u.d7), tipo: 'ensina' });
  }

  // achados pendentes da revisao mais recente (piscando no mapa ate o dono aprovar ou ignorar)
  const rev = revisaoMaisRecente();
  // 1o: o bloco que mandou a resposta errada naquela conversa (rastro); 2o: texto parecido; 3o: preco -> preco_medida, resto -> IA livre
  const blocoQueRespondeu = (a: any): string | null => {
    const trecho = normalizar(String(a?.respostaRobo || '').split(' / ')[0] || '').slice(0, 45);
    if (trecho.length < 8 || trecho.startsWith('sem resposta')) return null;
    const ev = (uso.eventosDosAchados[String(a?.chatJid || '')] || []).find((e) => e.texto.includes(trecho));
    if (!ev) return null;
    const exato = ev.chaves.find((k) => normalizar((catalogo.find((c) => c.chave === k)?.partes || []).join(' ')).includes(trecho.slice(0, 25)));
    return exato || ev.chaves[ev.chaves.length - 1] || null;
  };
  for (const a of (rev?.achados || []).filter((x) => x?.status === 'pendente').slice(0, 40)) {
    const pelaConversa = blocoQueRespondeu(a);
    const peloTexto = pelaConversa ? null : parecido(`${a.sugestao?.situacao || ''} ${a.resumo || ''} ${a.mensagemCliente || ''}`);
    const k = pelaConversa || peloTexto || (a.tipo === 'preco' ? 'preco_medida' : 'ia_livre');
    const alvo = `categoria:${k}`;
    const ligadoPor = pelaConversa ? 'conversa' : peloTexto ? 'texto' : 'tipo';
    nos.push({
      id: `achado:${rev?.data}:${a.id}`, tipo: 'achado', rotulo: curto(a.resumo || a.tipo || 'achado', 70), descricao: String(a.resumo || ''),
      acao: a.sugestao ? `${ROTULO_ACAO[a.sugestao.acao] || a.sugestao.acao}: ${a.sugestao.resposta || ''}` : '', ativo: true, usosHoje: 0, usos7d: 0,
      etapa: nos.find((n) => n.id === alvo)?.etapa || 'atendente',
      extra: { data: rev?.data, achado: { id: a.id, tipo: a.tipo, gravidade: a.gravidade, cliente: a.cliente, numero: a.numero, conta: a.conta, resumo: a.resumo, mensagemCliente: a.mensagemCliente, respostaRobo: a.respostaRobo, trecho: a.trecho, sugestao: a.sugestao, status: a.status }, ligadoA: alvo, ligadoPor },
    });
    ligacoes.push({ de: alvo, para: `achado:${rev?.data}:${a.id}`, peso: 1, tipo: 'achado' });
  }

  // propostas PENDENTES do aprendizado da Josy (mesmo padrao dos achados): ligadas ao bloco que a analise escolheu
  // (ligadoA), senao ao mais parecido pelo texto, senao a IA livre (que e justamente o que elas vem substituir)
  const aprendizado = lerAprendizado().dados.propostas;
  for (const p of aprendizado.filter((x) => x.status === 'pendente').slice(0, 80)) {
    const escolhido = p.ligadoA && idsValidos.has(p.ligadoA) ? p.ligadoA : null;
    const peloTexto = escolhido ? null : parecido(`${p.titulo || ''} ${p.quando || ''} ${p.sugestao?.situacao || ''}`);
    const alvo = escolhido || (peloTexto ? `categoria:${peloTexto}` : 'categoria:ia_livre');
    const sug = p.sugestao;
    nos.push({
      id: `aprendizado:${p.id}`, tipo: 'aprendizado', rotulo: curto(p.titulo || p.id, 70), descricao: String(p.quando || ''),
      acao: sug ? `${ROTULO_ACAO[String(sug.acao)] || sug.acao || ''}: ${sug.resposta || ''}` : '', ativo: true, usosHoje: 0, usos7d: 0,
      etapa: nos.find((n) => n.id === alvo)?.etapa || 'atendente',
      extra: { proposta: p, ligadoA: alvo, ligadoPor: escolhido ? 'proposta' : peloTexto ? 'texto' : 'nenhum' },
    });
    ligacoes.push({ de: alvo, para: `aprendizado:${p.id}`, peso: Math.max(1, Number(p.frequencia) || 1), tipo: 'aprendizado' });
  }

  return {
    geradoEm: new Date().toISOString(),
    uso: { fonte: uso.fonte, erro: uso.erro || null, desde: uso.desde, mensagensHoje: uso.mensagens.hoje, mensagens7d: uso.mensagens.d7, viaFluxo: uso.viaFluxo, viaLivre: uso.viaLivre },
    revisao: rev ? { data: rev.data, pendentes: rev.achados.filter((x) => x?.status === 'pendente').length } : null,
    aprendizado: contagemAprendizado(aprendizado),
    nos, ligacoes,
  };
}

export function rotasCerebro(urlGerarResposta: string): express.Router {
  const r = express.Router();
  // Leitura automática de DOT/odômetro pela foto (app GP Premium 1.1.6). Antes do bloqueio abaixo:
  // vale pro mecânico (módulo garantia50k), não só pra quem mexe no cérebro. Ver lerFoto.ts.
  r.post('/ler-foto', rotaLerFoto);
  r.use((req, res, next) => {
    const u = usuarioDoToken(req);
    if (!u) return res.status(401).json({ error: 'Não autenticado.' });
    if (!['master', 'admin', 'gerente'].includes(u.role)) return res.status(403).json({ error: 'Sem acesso ao cérebro do robô.' });
    (req as any).usuario = u;
    next();
  });
  const soDono = (req: express.Request, res: express.Response) => {
    if (ehDono((req as any).usuario)) return true;
    res.status(403).json({ error: 'Só o administrador pode mudar o que o robô aprende.' });
    return false;
  };

  r.get('/resumo', (_req, res) => {
    res.json({ licoes: lerLicoes().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)), revisoes: revisoesDisponiveis(), lojas: lojasDoRobo(), rodando: revisaoRodando(), aprendizado: contagemAprendizado(lerAprendizado().dados.propostas) });
  });

  // Aprendizado da Josy: propostas pra aprovar uma a uma. Sem o arquivo ainda = lista vazia.
  r.get('/aprendizado', (_req, res) => {
    const { existe, dados } = lerAprendizado();
    res.json({ ...dados, existe, contagem: contagemAprendizado(dados.propostas) });
  });

  // { decisao: 'aprovar' | 'ignorar', licao?: {situacao, acao, resposta, lojas}, audio?: '/midias/x.ogg' | null }
  r.post('/aprendizado/:id', (req, res) => {
    if (!soDono(req, res)) return;
    try {
      const [status, corpo] = decidirProposta(String(req.params.id), req.body, (req as any).usuario);
      res.status(status).json(corpo);
    } catch (e: any) {
      console.error('[BotService][Cerebro] aprendizado:', e?.message || e);
      res.status(500).json({ error: 'Não foi possível salvar a decisão.' });
    }
  });

  // Mapa do cerebro (neuronios + sinapses). Quem ve o resumo ve o mapa; mexer continua so com master/admin.
  r.get('/mapa', async (_req, res) => {
    try { res.json(await montarMapa()); }
    catch (e: any) { console.error('[BotService][Cerebro] mapa:', e?.message || e); res.status(500).json({ error: 'Não foi possível montar o mapa do cérebro.' }); }
  });

  r.post('/licoes', (req, res) => {
    if (!soDono(req, res)) return;
    const l = novaLicao(req.body, 'dono');
    if (typeof l === 'string') return res.status(400).json({ error: l });
    const todas = lerLicoes(); todas.push(l); salvarLicoes(todas);
    res.json({ ok: true, licao: l });
  });

  r.put('/licoes/:id', (req, res) => {
    if (!soDono(req, res)) return;
    const todas = lerLicoes();
    const x = todas.find((i) => i.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'Ensinamento não encontrado.' });
    const nova = novaLicao({ ...x, ...req.body }, x.origem);
    if (typeof nova === 'string') return res.status(400).json({ error: nova });
    Object.assign(x, { situacao: nova.situacao, acao: nova.acao, resposta: nova.resposta, lojas: nova.lojas, ativo: nova.ativo, ligadoA: nova.ligadoA, atualizadoEm: new Date().toISOString() });
    salvarLicoes(todas);
    res.json({ ok: true, licao: x });
  });

  r.delete('/licoes/:id', (req, res) => {
    if (!soDono(req, res)) return;
    salvarLicoes(lerLicoes().filter((i) => i.id !== req.params.id));
    res.json({ ok: true });
  });

  r.get('/revisoes/:data', (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.data)) return res.status(400).json({ error: 'Data inválida.' });
    const arq = path.join(PASTA_REVISOES, `${req.params.data}.json`);
    if (!fs.existsSync(arq)) return res.status(404).json({ error: 'Sem revisão nesse dia.' });
    res.json(lerJson<any>(arq, {}));
  });

  // Aprovar vira ensinamento (com o texto que o dono ajustou); ignorar so marca.
  r.post('/revisoes/:data/achados/:id', (req, res) => {
    if (!soDono(req, res)) return;
    const arq = path.join(PASTA_REVISOES, `${req.params.data}.json`);
    const rev = lerJson<any>(arq, null);
    const a = rev?.achados?.find((x: any) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: 'Achado não encontrado.' });
    const status = String(req.body?.status || '');
    if (status === 'aprovado') {
      const l = novaLicao(req.body?.licao || a.sugestao, 'revisao');
      if (typeof l === 'string') return res.status(400).json({ error: l });
      const todas = lerLicoes(); todas.push(l); salvarLicoes(todas);
      a.licaoId = l.id;
    } else if (status !== 'ignorado' && status !== 'pendente') return res.status(400).json({ error: 'Status inválido.' });
    a.status = status;
    a.decididoEm = new Date().toISOString();
    gravarJson(arq, rev);
    res.json({ ok: true, achado: a });
  });

  // Roda a revisao agora (processo separado, com prioridade baixa; nao mexe no WhatsApp).
  r.post('/revisar', (req, res) => {
    if (!soDono(req, res)) return;
    if (revisaoRodando()) return res.status(409).json({ error: 'Já tem uma revisão rodando.' });
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || '')) ? String(req.body.data) : '';
    const raiz = path.resolve(__dirname, '../..');
    const filho = spawn('nice', ['-n', '15', path.join(raiz, 'node_modules/.bin/ts-node'), '--transpile-only', '-r', 'dotenv/config', 'scripts/cerebro-revisao.ts', ...(data ? [data] : [])], {
      cwd: raiz, detached: true, stdio: ['ignore', fs.openSync('/root/whatsapp-crm/logs/cerebro-revisao.log', 'a'), fs.openSync('/root/whatsapp-crm/logs/cerebro-revisao.log', 'a')],
    });
    filho.unref();
    res.json({ ok: true, iniciado: true });
  });

  // Testa uma mensagem como se fosse um cliente (gera a resposta, nao manda nada pra ninguem).
  r.post('/testar', async (req, res) => {
    try {
      const mensagem = String(req.body?.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ error: 'Escreva a mensagem do cliente.' });
      const loja = lojasDoRobo().find((l) => l.id === req.body?.lojaId) || lojasDoRobo()[0];
      const historico = Array.isArray(req.body?.historico) ? req.body.historico.slice(-8).map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', content: String(h?.content || '').slice(0, 600) })) : [];
      const resp = await fetch(urlGerarResposta, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // audioFluxo: o teste mostra o marcador de audio (vira o player no painel); nada e enviado a ninguem
        body: JSON.stringify({ messages: [...historico, { role: 'user', content: mensagem }], lojaBot: loja ? { nome: loja.nome } : undefined, simular: false, teste: true, audioFluxo: true }),
      }).then((x) => x.json());
      res.json({ partes: resp.partes || [], via: resp.via, chaves: resp.chaves || [], licao: resp.licao || null });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha ao testar.' });
    }
  });

  return r;
}
