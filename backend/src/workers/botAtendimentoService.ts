import fs from 'fs';
import path from 'path';
import { prisma } from '../server';
import { decidirAntiLoop, JANELA_ECO_MS, MotivoAntiLoop, normalizarParaComparar } from '../data/comportamentoGuard';
import { JIDS_INTERNOS, numerosInternos } from '../services/contatosInternos';
import { transcricaoDoAudioFluxo } from '../data/fluxoCatalogo';
import { configBotDaLoja, antesDoInicioDoRobo, caminhoFotoFachada } from '../services/botLojas';
import { transcreverAudioLocal, transcricaoSalva, transcricaoLocalDisponivel } from '../services/transcricaoLocal';

// O texto da resposta (IA + tabela deterministica de preco) agora vem de um servico
// SEPARADO (bot-service, porta 3010) — de proposito. Antes, tudo isso rodava dentro
// deste mesmo processo (whatsapp-crm), e qualquer ajuste de prompt/logica do robo
// exigia reiniciar o processo INTEIRO, derrubando as conexoes de WhatsApp de TODOS os
// atendentes (mesmo quem nao usa robo nenhum). Corrigido em 25-26/08/2026: reiniciar
// o bot-service nunca mais afeta uma sessao de WhatsApp conectada.
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://127.0.0.1:3010';

// Coordenadas da loja pra mandar como pino nativo do WhatsApp (05/09). Lidas do mesmo
// arquivo de config do bot, direto — sem depender de reiniciar nada pra atualizar.
const CAMINHO_CONFIG_BOT = path.join(__dirname, '../../data/bot-pneus-config.json');
function lerLocalizacaoLoja(): { lat: number; lng: number; nome: string; endereco: string } | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(CAMINHO_CONFIG_BOT, 'utf8'));
    const lat = Number(cfg.LOCALIZACAO_LAT);
    const lng = Number(cfg.LOCALIZACAO_LNG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, nome: String(cfg.NOME_LOJA || 'Loja'), endereco: String(cfg.LOCALIZACAO || '') };
  } catch { return null; }
}

type EnviarParte = (texto: string, tempoDigitacaoMs: number) => Promise<boolean>;
type EnviarVideo = (video: VideoBotIA, tempoDigitacaoMs: number) => Promise<boolean>;
type EnviarLocalizacao = (lat: number, lng: number, nome: string, endereco: string, fotoFachada?: string) => Promise<boolean>;
type Etiquetar = (etiqueta: { id: string; nome: string; cor?: number }) => Promise<boolean>;

interface VideoBotIA {
  // 'audio' = mensagem de voz (PTT) gravada pelo dono; o envio fica em enviarMidiaBotIA (whatsappService.ts).
  tipo: 'video' | 'audio';
  caminho?: string;
  url?: string;
  legenda?: string;
  nome?: string;
}

interface AgendarBotParams {
  usuarioId: string;
  chatJid: string;
  waId: string;
  enviarParte: EnviarParte;
  enviarVideo: EnviarVideo;
  enviarLocalizacao: EnviarLocalizacao;
  // Etiqueta do WhatsApp Business no chat (opcional: quem nao manda, o robo so nao etiqueta).
  etiquetar?: Etiquetar;
  // Tipo/conteudo da mensagem que disparou este agendamento (opcional — so quem
  // ja calculou isso, hoje so o handler de mensagem recebida em whatsappService.ts,
  // manda). Usado so pra decidir o TAMANHO da espera do debounce (achado 18/09).
  ultimoTipo?: string;
  ultimoTextoTemMedida?: boolean;
  // Quantas vezes esta rodada ja foi reagendada por chegar mensagem nova (trava contra ciclo).
  reagendamentos?: number;
}

interface RespostaBotService {
  partes: string[];
  deterministico: boolean;
  novoEstadoPreco?: string;
  novosDadosPreco?: string;
  // Tipo da acao que o fluxo deterministico decidiu (ex.: 'ENVIAR_LOCALIZACAO_FIXA') — e o
  // CODIGO, nao a IA, que decide disparar o pino de localizacao.
  acaoTipo?: string;
  // Rastro do fluxo (fluxograma ao vivo do painel)
  via?: string;
  assuntos?: string[];
  chaves?: string[];
  motivoLivre?: string;
  rajada?: string[];
  visita?: { iso: string; rotulo: string; diasAte: number } | undefined;
}

// Registra POR ONDE a(s) mensagem(ns) do cliente passou no fluxo — alimenta o fluxograma ao vivo da tela
// "Fluxo" do painel. Nunca pode atrapalhar a resposta: qualquer erro so vai pro log.
async function registrarEventoFluxo(params: AgendarBotParams, resposta: RespostaBotService, estadoAntes: string, partesEnviadas: string[]) {
  try {
    const nome = await prisma.mensagem.findFirst({
      where: { usuarioId: params.usuarioId, chatJid: params.chatJid, chatNome: { not: '' } },
      orderBy: { timestamp: 'desc' },
      select: { chatNome: true },
    });
    await prisma.fluxoEvento.create({
      data: {
        usuarioId: params.usuarioId,
        chatJid: params.chatJid,
        chatNome: nome?.chatNome || null,
        cliente: (resposta.rajada || []).join(' / ').slice(0, 900),
        assuntos: JSON.stringify(resposta.assuntos || []),
        chaves: JSON.stringify(resposta.chaves || []),
        via: resposta.via || (resposta.deterministico ? 'fluxo' : 'ia_livre'),
        motivoLivre: resposta.motivoLivre || null,
        estadoAntes,
        estadoDepois: resposta.novoEstadoPreco || estadoAntes,
        partes: JSON.stringify(partesEnviadas.map((p) => {
          if (p === '[ENVIAR_LOCALIZACAO]') return '📍 (pino da localização)';
          const audio = interpretarMarcadorAudio(p);
          if (audio) return `🔊 (áudio: ${audio.arquivo})`;
          return p.slice(0, 400);
        })),
      },
    });
    // Limpeza: guarda 14 dias (tabela pequena, roda de vez em quando).
    if (Math.random() < 0.01) await prisma.fluxoEvento.deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - 14 * 24 * 3600 * 1000) } } });
  } catch (e) {
    console.error('[Bot IA] falha ao registrar o rastro do fluxo (a resposta foi enviada normalmente):', (e as any)?.message || e);
  }
}

// Respostas do fluxo editadas pelo dono na tela "Fluxo" do painel (tabela FluxoResposta,
// so a diferenca do texto padrao). Falha na leitura = sem edicao: o robo usa o texto padrao
// e nunca deixa de responder por causa disso.
async function carregarTextosFluxo(lojaId?: string | null): Promise<Record<string, string[]>> {
  try {
    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const saida: Record<string, string[]> = {};
    const daLoja: Record<string, string[]> = {};
    const pref = lojaId ? `loja:${lojaId}:` : null;
    for (const l of linhas) {
      try {
        const partes = JSON.parse(l.partes);
        if (!Array.isArray(partes)) continue;
        // 21/10: texto proprio da loja ("loja:<id>:<chave>") ganha do geral; texto de OUTRA loja nao entra.
        if (l.chave.startsWith('loja:')) { if (pref && l.chave.startsWith(pref)) daLoja[l.chave.slice(pref.length)] = partes.map(String); continue; }
        saida[l.chave] = partes.map(String);
      } catch { /* linha corrompida: ignora, usa o padrao */ }
    }
    return { ...saida, ...daLoja };
  } catch (e) {
    console.error('[Bot IA] falha ao ler FluxoResposta (usando textos padrao):', (e as any)?.message || e);
    return {};
  }
}

// Ha quantos minutos o pino de localizacao foi mandado NESTA conversa (pelo robo ou por um
// atendente), olhando ate 12h atras. null = nao foi mandado (ou falha ao ler: na duvida deixa
// mandar). Achado 18/09 (caso Marcia Lima): a IA livre repetia a marca [ENVIAR_LOCALIZACAO]
// a cada resposta porque o cliente tinha perguntado o endereco antes — 3 pinos em 5 minutos.
async function minutosDesdeUltimaLocalizacao(usuarioId: string, chatJid: string): Promise<number | null> {
  try {
    const ultima = await prisma.mensagem.findFirst({
      where: { usuarioId, chatJid, fromMe: true, tipo: 'localizacao', timestamp: { gt: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    return ultima ? Math.max(0, Math.round((Date.now() - new Date(ultima.timestamp).getTime()) / 60000)) : null;
  } catch {
    return null;
  }
}

// A resposta que esta rodada vai mandar JA foi mandada (inteira) ha poucos segundos nesta conversa? Duas rodadas
// do robo se atropelam quando o cliente escreve enquanto a anterior ainda esta mandando as bolhas (achado 21/09,
// caso Carlos Gomes: "Poderia me informar a medida..." mandada 2x em 11s): a 2a rodada le a conversa antes de a
// 1a terminar de gravar as bolhas e responde a mesma coisa. Compara so a resposta INTEIRA (todas as bolhas iguais
// as ja enviadas): uma bolha repetida no meio de uma resposta nova — ex.: "Se preferir, parcele em ate 10x" depois do
// preco de OUTRA medida — continua saindo normalmente. Falha ao ler = nao descarta (na duvida, responde).
// `inicioDaRodada` = a mensagem do cliente mais antiga que esta rodada esta respondendo. So conta como duplicada uma
// bolha gravada DEPOIS dela: uma bolha mais velha respondia OUTRA pergunta (o cliente que repete "quanto custa?" 40 s
// depois da resposta tem que receber a resposta de novo — revisao 21/09), ja a do caso Carlos Gomes foi gravada logo
// depois da mensagem que a 2a rodada ia responder.
const JANELA_RESPOSTA_DUPLICADA_S = 90;
async function respostaJaEnviadaHaPouco(usuarioId: string, chatJid: string, partes: string[], inicioDaRodada?: Date | null): Promise<boolean> {
  try {
    const novas = partes.map((p) => normalizarParaComparar(limparTagsEspeciais(p))).filter(Boolean);
    if (!novas.length) return false;
    const janela = Date.now() - JANELA_RESPOSTA_DUPLICADA_S * 1000;
    const desde = new Date(Math.max(janela, inicioDaRodada ? inicioDaRodada.getTime() : 0));
    const recentes = await prisma.mensagem.findMany({
      where: { usuarioId, chatJid, fromMe: true, tipo: 'texto', timestamp: { gte: desde } },
      select: { texto: true },
    });
    const jaEnviadas = new Set(recentes.map((r) => normalizarParaComparar(r.texto || '')).filter(Boolean));
    return novas.every((n) => jaEnviadas.has(n));
  } catch {
    return false;
  }
}

// Marca a conversa como tratada pelo robo (ultimaRespostaEm) mesmo sem mandar mensagem — o Vigia usa isso pra
// saber que NAO precisa acionar o robo de novo.
// `tratadaAte` = timestamp da ULTIMA mensagem do cliente que esta rodada leu: assim uma mensagem que chegou depois
// continua aparecendo como "sem resposta" pro Vigia (com new Date() ela ficava escondida — revisao 21/09).
// Nao mexe em estado nem em ultimoInboundWaId: no silencio nada mudou, e a rodada mais nova pode ja ter gravado os dela.
async function marcarConversaTratada(params: AgendarBotParams, tratadaAte: Date) {
  try {
    // Nunca volta o relogio pra tras (ultimaRespostaEm pode ja ter sido gravado por uma resposta mais recente).
    const atual = await prisma.botConversa.findUnique({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      select: { ultimaRespostaEm: true },
    });
    const valor = atual?.ultimaRespostaEm && atual.ultimaRespostaEm.getTime() > tratadaAte.getTime() ? atual.ultimaRespostaEm : tratadaAte;
    await prisma.botConversa.upsert({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId, ultimaRespostaEm: valor },
      update: { ultimaRespostaEm: valor },
    });
  } catch (e) {
    console.error('[Bot IA] falha ao marcar a conversa como tratada (silencio):', (e as any)?.message || e);
  }
}

async function dispararLocalizacaoDaLoja(params: AgendarBotParams) {
  // 21/10: pino e foto da LOJA do atendente (bot-lojas.json); sem bloco da loja, o config geral (como antes).
  const cfgLoja = await configBotDaLoja(params.usuarioId);
  const geral = lerLocalizacaoLoja();
  const loc = cfgLoja.porLoja && Number.isFinite(cfgLoja.LOCALIZACAO_LAT) && Number.isFinite(cfgLoja.LOCALIZACAO_LNG)
    ? { lat: cfgLoja.LOCALIZACAO_LAT as number, lng: cfgLoja.LOCALIZACAO_LNG as number, nome: cfgLoja.NOME_LOJA, endereco: cfgLoja.LOCALIZACAO, foto: caminhoFotoFachada(cfgLoja) }
    : (geral ? { ...geral, foto: undefined as string | undefined } : null);
  if (!loc) {
    console.error('[Bot IA] localizacao pedida mas LOCALIZACAO_LAT/LNG nao configurados.');
    return;
  }
  await params.enviarLocalizacao(loc.lat, loc.lng, loc.nome, loc.endereco, loc.foto).catch(() => {});
}

const timers = new Map<string, NodeJS.Timeout>();
const versoes = new Map<string, number>();

const chave = (usuarioId: string, chatJid: string) => `${usuarioId}:${chatJid}`;

// Bolha "natural": ate ~120 caracteres. Texto maior quebra em fim de frase (". ", "! ", "? " seguido de letra
// maiuscula/emoji/asterisco) ou em linha em branco, juntando frases curtas na mesma bolha. Lista (linhas com
// medida/preco) fica inteira. No maximo 4 bolhas por parte.
export function quebrarEmBolhas(texto: string): string[] {
  const t = String(texto || '').trim();
  if (t.length <= 120) return t ? [t] : [];
  if (/\n\s*[-•\d*]/.test(t) && !/\n\n/.test(t)) return [t];
  const frases = t
    .split(/\n{2,}/)
    .flatMap((bloco) => bloco.split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ*🔥😊👍🙋])/u))
    .map((x) => x.trim())
    .filter(Boolean);
  const bolhas: string[] = [];
  let atual = '';
  for (const fr of frases) {
    if (atual && (atual.length + 1 + fr.length) > 120) { bolhas.push(atual); atual = fr; }
    else atual = atual ? `${atual} ${fr}` : fr;
  }
  if (atual) bolhas.push(atual);
  if (bolhas.length > 4) return [...bolhas.slice(0, 3), bolhas.slice(3).join(' ')];
  return bolhas;
}

// Trava final (21/10): nada com cara de codigo/JSON vai pro cliente, venha de onde vier.
const BOLHA_DE_CODIGO = /<\/?(invoke|parameter|function_calls|antml)|```|"partes"\s*:/i;

async function enviarEmBolhas(params: AgendarBotParams, texto: string): Promise<boolean> {
  if (BOLHA_DE_CODIGO.test(texto)) {
    console.error(`[Bot IA] ${params.chatJid}: resposta com cara de codigo BLOQUEADA (nao enviada): ${texto.slice(0, 160)}`);
    return false;
  }
  for (const bolha of quebrarEmBolhas(texto)) {
    const ok = await params.enviarParte(bolha, tempoDigitacao(bolha));
    if (!ok) return false;
  }
  return true;
}

// Mensagens que a loja manda sem ser uma pessoa atendendo: saudacao automatica do WhatsApp Business e o 🙋🏼‍♀️.
const MSG_AUTOMATICA_DA_LOJA = /Seja bem-vindo\(a\)|^\s*🙋🏼‍♀️\s*$/;

const REGEX_CANDIDATO = /(curr[ií]cul(o|um)|\bcv\b|contratando|vaga(s)? de (emprego|trabalho|auxiliar|mec[aâ]nic|vendedor|atendente|borracheir|motorista|estagi)|interesse (na|em uma|numa) vaga|(alguma|tem|h[aá]) vaga (de|pra|para) (emprego|trabalh)|fazer parte d[ae] (sua |vossa )?(empresa|equipe)|trabalhar (com voc[eê]s|a[ií] na|na (empresa|loja) de voc)|\bemprego\b)/i;
export function ehCandidatoAVaga(textos: string[]): boolean {
  return textos.some((t) => REGEX_CANDIDATO.test(String(t || '')));
}

// Lembretes da visita (21/10): o cliente disse que vem num dia certo. Vespera 17h (se faltar 2+ dias) e no dia 8h30,
// em nome do atendente dono do numero. Um lembrete por cliente: se ele remarcar, os pendentes antigos saem.
// observacoes 'robo-visita' = criado pelo robo (fora da pontuacao das atendentes).
async function agendarLembretesVisita(params: AgendarBotParams, visita: { iso: string; rotulo: string; diasAte: number }, nomeLoja: string) {
  try {
    const { horariosLembreteVisita } = await import('../data/visita');
    const h = horariosLembreteVisita(visita);
    if (!h.vespera && !h.noDia) return;
    const msgNum = await prisma.mensagem.findFirst({ where: { usuarioId: params.usuarioId, chatJid: params.chatJid, numeroReal: { not: null } }, orderBy: { timestamp: 'desc' }, select: { numeroReal: true } });
    const numero = (String(msgNum?.numeroReal || '').split(':')[0] || (params.chatJid.includes('@lid') ? '' : params.chatJid.split('@')[0]) || '').replace(/\D/g, '');
    if (numero.length < 10) { console.error(`[Bot IA] ${params.chatJid}: visita confirmada mas sem numero real — lembrete nao agendado.`); return; }
    const ultimaNome = await prisma.mensagem.findFirst({ where: { usuarioId: params.usuarioId, chatJid: params.chatJid, chatNome: { not: '' } }, orderBy: { timestamp: 'desc' }, select: { chatNome: true } });
    const nomeCompleto = String(ultimaNome?.chatNome || '').trim();
    const primeiro = /^[A-Za-zÀ-ÿ]{2,}/.test(nomeCompleto) ? (nomeCompleto.split(/\s+/)[0] || '') : '';
    const nome = primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : '';
    const cliente = nomeCompleto || numero;
    await prisma.agendamento.deleteMany({ where: { criadoPorId: params.usuarioId, numero, status: 'pendente', observacoes: { contains: 'robo-visita' } } });
    const criar = (enviarEm: Date, mensagem: string, cancelarSeResponder: boolean) =>
      prisma.agendamento.create({ data: { cliente, numero, mensagem, enviarEm, criadoPorId: params.usuarioId, status: 'pendente', cancelarSeResponder, observacoes: `robo-visita ${visita.iso}` } });
    if (h.vespera) await criar(h.vespera, `Oi${nome ? `, ${nome}` : ''}! Passando pra confirmar: amanhã a gente te espera aqui na ${nomeLoja} 😊 Tá confirmado?`, true);
    if (h.noDia) await criar(h.noDia, `Bom dia${nome ? `, ${nome}` : ''}! Hoje é o dia 😊 Estamos te esperando aqui na ${nomeLoja}. Qualquer coisa é só me chamar!`, false);
    console.log(`[Bot IA] ${params.chatJid}: visita ${visita.iso} — lembretes agendados (vespera: ${h.vespera ? 'sim' : 'nao'}, no dia: ${h.noDia ? 'sim' : 'nao'}).`);
  } catch (e: any) {
    console.error('[Bot IA] erro ao agendar lembretes da visita:', e?.message || e);
  }
}

function tempoDigitacao(texto: string): number {
  const variacao = Math.floor(Math.random() * 900);
  return Math.min(6000, Math.max(1200, 700 + texto.length * 28 + variacao));
}

function arquivoDaMidia(mensagem: any): string | null {
  if (!mensagem?.midiaUrl) return null;
  const raiz = path.resolve(__dirname, '../../public');
  const arquivo = path.resolve(raiz, String(mensagem.midiaUrl).replace(/^[/\\]+/, ''));
  return arquivo.startsWith(raiz + path.sep) && fs.existsSync(arquivo) ? arquivo : null;
}

// Audio do cliente vira texto (21/10, whisper local — sem OpenAI). Os da rodada atual (depois da ultima
// mensagem da loja) sao transcritos agora; os mais antigos so usam o texto se ja foi feito antes.
// O texto entra no lugar do audio (so na memoria, o banco nao muda) e a mensagem fica marcada __transcrito.
async function transcreverAudiosDoCliente(historico: any[], chatJid: string): Promise<void> {
  if (!transcricaoLocalDisponivel()) return;
  let ini = historico.length;
  while (ini > 0 && !historico[ini - 1].fromMe) ini--;
  for (let i = 0; i < historico.length; i++) {
    const m = historico[i];
    if (m.fromMe || m.tipo !== 'audio' || String(m.texto || '').trim()) continue;
    const arquivo = arquivoDaMidia(m);
    if (!arquivo) continue;
    const texto = i >= ini ? await transcreverAudioLocal(arquivo) : transcricaoSalva(arquivo);
    if (texto) { m.texto = texto; m.__transcrito = true; }
    else if (i >= ini) console.log(`[Bot IA] ${chatJid}: audio do cliente sem transcricao — o robo pede pra escrever.`);
  }
}

function midiaDaUltima(mensagem: any): { imagem?: any; audio?: any } {
  if (!mensagem?.midiaUrl || !['imagem', 'audio'].includes(mensagem.tipo)) return {};
  try {
    const raiz = path.resolve(__dirname, '../../public');
    const arquivo = path.resolve(raiz, String(mensagem.midiaUrl).replace(/^[/\\]+/, ''));
    if (!arquivo.startsWith(raiz + path.sep) || !fs.existsSync(arquivo)) return {};
    const stat = fs.statSync(arquivo);
    if (stat.size <= 0 || stat.size > 9 * 1024 * 1024) return {};
    const ext = path.extname(arquivo).toLowerCase();
    const mime = mensagem.tipo === 'audio'
      ? (ext === '.mp3' ? 'audio/mpeg' : 'audio/ogg')
      : (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
    const item = { base64: fs.readFileSync(arquivo).toString('base64'), mime };
    return mensagem.tipo === 'audio' ? { audio: item } : { imagem: item };
  } catch (e) {
    console.error('[Bot IA] Falha ao preparar midia:', (e as any)?.message);
    return {};
  }
}

function extrairCampoTag(payload: string, campo: string): string | undefined {
  const quoted = new RegExp(`${campo}\\s*=\\s*"([^"]+)"`, 'i').exec(payload);
  if (quoted?.[1]) return quoted[1].trim();
  const simple = new RegExp(`${campo}\\s*=\\s*([^,\\]\\s]+)`, 'i').exec(payload);
  if (simple?.[1]) return simple[1].trim();
  return undefined;
}

function extrairVideosDoTexto(texto: string): VideoBotIA[] {
  const tags = [...texto.matchAll(/\[(?:ENVIAR_VIDEO|VIDEO):\s*([^\]]+)\]/gi)];
  const videos: VideoBotIA[] = [];

  for (const tag of tags) {
    const payload = String(tag[1] || '').trim();
    if (!payload) continue;

    const caminho = extrairCampoTag(payload, 'caminho') || extrairCampoTag(payload, 'arquivo');
    const url = extrairCampoTag(payload, 'url');
    const legenda = extrairCampoTag(payload, 'legenda');
    const nome = extrairCampoTag(payload, 'nome');
    const slug = extrairCampoTag(payload, 'slug');
    const brutoSemChaves = payload.includes('=') ? '' : payload.replace(/^"|"$/g, '').trim();

    const video: VideoBotIA = { tipo: 'video' };
    if (url) video.url = url;
    else if (caminho) video.caminho = caminho;
    else if (slug) video.caminho = `/midias/bot-videos/${slug.replace(/^[/\\]+/, '')}.mp4`;
    else if (brutoSemChaves) video.caminho = brutoSemChaves.endsWith('.mp4')
      ? brutoSemChaves
      : `/midias/bot-videos/${brutoSemChaves.replace(/^[/\\]+/, '')}.mp4`;

    if (legenda) video.legenda = legenda;
    if (nome) video.nome = nome;

    if (video.url || video.caminho) videos.push(video);
  }

  return videos;
}

// AUDIO do fluxo (15/10): o motor coloca "[ENVIAR_AUDIO:arquivo]" (ou "[ENVIAR_AUDIO:arquivo!N]" = o audio
// substitui as N partes de texto seguintes) nas partes da resposta. O nome so aceita [a-z0-9_-], entao o
// caminho abaixo nunca sai de /midias/bot-audios/.
function interpretarMarcadorAudio(parte: string): { arquivo: string; pular: number } | null {
  const m = /^\[ENVIAR_AUDIO:([a-z0-9_-]+)(?:!(\d{1,2}))?\]$/i.exec(parte.trim());
  if (!m || !m[1]) return null;
  return { arquivo: m[1], pular: m[2] ? Math.min(parseInt(m[2], 10), 4) : 0 };
}

const PASTA_AUDIOS_BOT = path.join(__dirname, '../../public/midias/bot-audios');
// Evita o mesmo audio duas vezes seguidas na mesma conversa (duas rodadas do robo se atropelando).
const ultimoAudioNaConversa = new Map<string, { arquivo: string; em: number }>();
const JANELA_AUDIO_REPETIDO_MS = 90_000;

// Manda UM audio do fluxo como mensagem de voz. false = nao foi enviado (arquivo ausente, repetido ha pouco
// ou falha): quem chama segue com o texto de reserva.
async function enviarAudioDoFluxo(params: AgendarBotParams, arquivo: string, textoDoAudio: string): Promise<boolean> {
  try {
    const abs = path.join(PASTA_AUDIOS_BOT, `${arquivo}.ogg`);
    if (!fs.existsSync(abs)) {
      console.error(`[Bot IA] ${params.chatJid}: audio do fluxo "${arquivo}" nao encontrado em ${PASTA_AUDIOS_BOT} — vai o texto.`);
      return false;
    }
    const k = chave(params.usuarioId, params.chatJid);
    const anterior = ultimoAudioNaConversa.get(k);
    if (anterior && anterior.arquivo === arquivo && Date.now() - anterior.em < JANELA_AUDIO_REPETIDO_MS) {
      console.log(`[Bot IA] ${params.chatJid}: audio "${arquivo}" ja enviado ha menos de ${JANELA_AUDIO_REPETIDO_MS / 1000}s — nao repete.`);
      return true; // ja foi: nao manda o texto de reserva tambem
    }
    const legenda = (textoDoAudio || transcricaoDoAudioFluxo(arquivo)).slice(0, 900);
    const tempo = 2500 + Math.floor(Math.random() * 2000); // "gravando audio..." por alguns segundos
    const enviado = await params.enviarVideo({ tipo: 'audio', caminho: `/midias/bot-audios/${arquivo}.ogg`, ...(legenda ? { legenda } : {}) }, tempo);
    if (enviado) ultimoAudioNaConversa.set(k, { arquivo, em: Date.now() });
    return !!enviado;
  } catch (e) {
    console.error(`[Bot IA] ${params.chatJid}: falha ao mandar o audio "${arquivo}":`, (e as any)?.message || e);
    return false;
  }
}

function limparTagsEspeciais(texto: string): string {
  return texto
    .replace(/\[ENVIAR_AUDIO:[^\]]+\]/gi, '')
    .replace(/\[TRANSFERIR_HUMANO\]/g, '')
    .replace(/\[AGENDAR_VISITA:[^\]]+\]/gi, '')
    .replace(/\[LEMBRAR:[^\]]+\]/gi, '')
    .replace(/\[(?:ENVIAR_VIDEO|VIDEO):[^\]]+\]/gi, '')
    .replace(/\[ENVIAR_LOCALIZACAO\]/gi, '')
    .trim();
}

async function gerarRespostaViaBotService(args: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  imagem?: any;
  audio?: any;
  lojas: Array<{ nome: string | null; cidade: string | null; estado: string | null; whatsapp: string | null; telefone_fixo: string | null }>;
  ultimosTextosCliente: string;
  estadoPreco: string;
  dadosPreco: string;
  textosFluxo?: Record<string, string[]>;
  lojaBot?: { nome: string; telefone: string; horario: string; localizacao: string; localizacaoTexto: string } | undefined;
  minutosDesdeLocalizacao?: number | null;
  minutosDesdeUltimaDaLoja?: number | null;
}): Promise<RespostaBotService> {
  const resposta = await fetch(`${BOT_SERVICE_URL}/gerar-resposta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // audioFluxo: este processo SABE enviar os audios do fluxo ([ENVIAR_AUDIO:...]). Sem esta marca (versao antiga
    // daqui, ou o painel simulando) o bot-service tira os marcadores e devolve so o texto — nunca vaza marcador.
    body: JSON.stringify({ ...args, audioFluxo: true }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`bot-service ${resposta.status}: ${body?.error || 'resposta invalida'}`);
  }
  return {
    partes: Array.isArray(body?.partes) ? body.partes.map(String) : [],
    deterministico: !!body?.deterministico,
    acaoTipo: typeof body?.acaoTipo === 'string' ? body.acaoTipo : undefined,
    via: typeof body?.via === 'string' ? body.via : undefined,
    assuntos: Array.isArray(body?.assuntos) ? body.assuntos.map(String) : undefined,
    chaves: Array.isArray(body?.chaves) ? body.chaves.map(String) : undefined,
    visita: body?.visita && typeof body.visita.iso === 'string' ? { iso: String(body.visita.iso), rotulo: String(body.visita.rotulo || ''), diasAte: Number(body.visita.diasAte) || 0 } : undefined,
    motivoLivre: typeof body?.motivoLivre === 'string' ? body.motivoLivre : undefined,
    rajada: Array.isArray(body?.rajada) ? body.rajada.map(String) : undefined,
    novoEstadoPreco: typeof body?.novoEstadoPreco === 'string' ? body.novoEstadoPreco : undefined,
    novosDadosPreco: typeof body?.novosDadosPreco === 'string' ? body.novosDadosPreco : undefined,
  };
}

// A conversa esta liberada pro robo (nao ha pausa em vigor)? Achado 18/09 (caso Marcia Lima:
// 4 mensagens em 1,5s ficaram ~10 min sem resposta): a checagem antiga exigia que o waId da
// mensagem que AGENDOU fosse igual ao da mensagem mais nova do banco. Numa rajada as chamadas
// de agendar nao chegam na ordem em que as mensagens chegaram (cada handler espera coisas
// diferentes — resolver o numero real do @lid, gravar no banco), entao o timer que sobrevivia
// era de uma mensagem mais velha, a checagem dava "nao e mais a atual" e o robo desistia em
// silencio. Quem decide "esta resposta ficou velha" agora e a VERSAO do agendamento (cada nova
// mensagem invalida a anterior), nao a igualdade de waId.
async function conversaLiberada(usuarioId: string, chatJid: string): Promise<boolean> {
  const estado = await prisma.botConversa.findUnique({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    select: { pausadoAte: true },
  });
  return !estado?.pausadoAte || estado.pausadoAte.getTime() <= Date.now();
}

const MAX_REAGENDAMENTOS_CONTEXTO = 3;

// REMARKETING (02/09). Quando o cliente diz que volta depois — "dia 10 eu passo ai",
// "quando eu receber", "semana que vem" — a conversa morria ali e o lead esfriava.
// Agora o robo agenda ele mesmo uma mensagem pra aquela data, com um texto que ELE
// escreve entendendo o contexto (a medida que o cliente queria, o preco ja passado,
// o que ficou combinado). Se o cliente responder antes, o agendamento se cancela
// sozinho (cancelarSeResponder), pra ninguem levar cobranca desnecessaria.
async function processarRemarketing(usuarioId: string, chatJid: string, texto: string, nomeCliente?: string) {
  try {
    const match = /\[LEMBRAR:\s*([^\]]+)\]/i.exec(texto);
    if (!match || !match[1]) return;

    const payload = String(match[1]);
    const dataMatch = /data="([^"]+)"/i.exec(payload);
    const textoMatch = /texto="([^"]+)"/i.exec(payload);
    if (!dataMatch || !dataMatch[1] || !textoMatch || !textoMatch[1]) {
      console.error('[Remarketing] Tag [LEMBRAR] sem data ou sem texto — ignorada:', payload.slice(0, 120));
      return;
    }

    // A data vem no horario de Brasilia (o robo raciocina nele). Sem o fuso explicito
    // o Node interpretaria como UTC e a mensagem sairia 3 horas antes do combinado.
    const bruto = String(dataMatch[1]).trim().replace(' ', 'T');
    const comFuso = /[Zz]|[+-]\d{2}:\d{2}$/.test(bruto) ? bruto : bruto + '-03:00';
    const quando = new Date(comFuso);
    if (isNaN(quando.getTime())) {
      console.error('[Remarketing] Data invalida:', dataMatch[1]);
      return;
    }

    const agora = Date.now();
    const limite = agora + 60 * 24 * 60 * 60 * 1000; // 60 dias
    if (quando.getTime() < agora + 10 * 60 * 1000) {
      console.error('[Remarketing] Data no passado ou perto demais, ignorada:', quando.toISOString());
      return;
    }
    if (quando.getTime() > limite) {
      console.error('[Remarketing] Data longe demais (>60 dias), ignorada:', quando.toISOString());
      return;
    }

    const numeroLimpo = chatJid.replace(/[^0-9]/g, '');

    // Uma conversa nao pode acumular varios lembretes: se ja existe um pendente pra
    // esse numero, troca a data/texto em vez de criar outro (senao o cliente recebe
    // a mesma cobranca 3 vezes — ja aconteceu spam real por falta de trava assim).
    const jaExiste = await prisma.agendamento.findFirst({
      where: { numero: numeroLimpo, criadoPorId: usuarioId, status: 'pendente' },
      select: { id: true },
    });

    const dados = {
      cliente: nomeCliente || 'Cliente WhatsApp',
      numero: numeroLimpo,
      mensagem: String(textoMatch[1]).slice(0, 1200),
      enviarEm: quando,
      criadoPorId: usuarioId,
      status: 'pendente',
      cancelarSeResponder: true,
    };

    if (jaExiste) {
      await prisma.agendamento.update({ where: { id: jaExiste.id }, data: dados });
      console.log(`[Remarketing] Lembrete de ${numeroLimpo} REMARCADO para ${quando.toISOString()}.`);
    } else {
      await prisma.agendamento.create({ data: dados });
      console.log(`[Remarketing] Lembrete criado para ${numeroLimpo} em ${quando.toISOString()}.`);
    }
  } catch (err: any) {
    console.error('[Remarketing] Erro ao agendar:', err?.message || err);
  }
}

async function processarAgendamentoAutomatico(usuarioId: string, chatJid: string, texto: string) {
  try {
    const match = /\[AGENDAR_VISITA:\s*([^\]]+)\]/i.exec(texto);
    if (!match || !match[1]) return;

    const payloadStr = String(match[1]);
    const dataMatch = /data="([^"]+)"/i.exec(payloadStr) || /data=([^,\s]+)/i.exec(payloadStr);
    const lojaMatch = /loja="([^"]+)"/i.exec(payloadStr) || /loja=([^,\s]+)/i.exec(payloadStr);
    const servicoMatch = /servico="([^"]+)"/i.exec(payloadStr) || /servico=([^,\s]+)/i.exec(payloadStr);
    const clienteMatch = /cliente="([^"]+)"/i.exec(payloadStr) || /cliente=([^,\s]+)/i.exec(payloadStr);

    const dataStr = dataMatch && dataMatch[1] ? dataMatch[1] : '';
    const dataAgendamento = dataStr ? new Date(dataStr) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const clienteNome = clienteMatch && clienteMatch[1] ? clienteMatch[1] : 'Cliente WhatsApp';
    const servicoNome = servicoMatch && servicoMatch[1] ? servicoMatch[1] : 'Visita/Montagem';
    const lojaNome = lojaMatch && lojaMatch[1] ? lojaMatch[1] : 'Loja';
    const numeroLimpo = chatJid.replace(/[^0-9]/g, '');

    await prisma.agendamento.create({
      data: {
        cliente: clienteNome,
        numero: numeroLimpo,
        mensagem: `Agendamento automático IA: ${servicoNome} (${lojaNome})`,
        enviarEm: isNaN(dataAgendamento.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000) : dataAgendamento,
        criadoPorId: usuarioId,
        status: 'pendente',
      },
    });

    console.log(`[Bot IA] ✅ Agendamento automático criado com sucesso para ${clienteNome} (${numeroLimpo})`);
  } catch (err) {
    console.error('[Bot IA] Erro ao criar agendamento automático:', err);
  }
}

// TRAVA ANTI-LOOP (02/09). Caso real: o numero da loja acabou conversando com OUTRO
// assistente de IA. Cada resposta nossa disparava uma resposta dele, que disparava a
// nossa de novo — dezenas de mensagens no mesmo minuto, virando spam de verdade no
// WhatsApp (risco de bloqueio do numero). Nenhum cliente humano manda 8 mensagens em
// 5 minutos exigindo resposta, entao esse ritmo so acontece em loop de robo.
// LISTA DE QUEM O ROBO NAO ATENDE (02/09). Fornecedor, parceiro, numero interno,
// outro sistema — gente com quem a loja conversa mas que NAO e cliente. Caso real: o
// robo entrou na negociacao com o fornecedor Pneus GP Premium e comecou a passar os
// precos de VAREJO da loja no meio de uma conversa de ATACADO. As mensagens continuam
// aparecendo no painel normalmente — o robo so nao responde sozinho.
// O arquivo e lido a cada mensagem, entao dá pra incluir/remover numero sem reiniciar.
const CAMINHO_NAO_ATENDER = path.join(__dirname, '../../data/bot-nao-atender.json');

// Confere numero E nome (05/09: "qualquer pessoa que tiver GWT Global no nome" —
// padrao de empresa, nao um numero especifico. Recebe o chatJid pra checar o numero
// e busca o ultimo nome conhecido desse chat pra checar contra os padroes de nome.
export async function naoAtender(usuarioId: string, chatJid: string): Promise<boolean> {
  try {
    // Equipe e lojas do grupo: mesma lista das metricas e da Caixa de Entrada (contatosInternos.ts).
    // 23/09: o robo respondeu um aviso interno da Danubia como se fosse cliente.
    if (JIDS_INTERNOS.includes(chatJid)) return true;

    const cfg = fs.existsSync(CAMINHO_NAO_ATENDER) ? JSON.parse(fs.readFileSync(CAMINHO_NAO_ATENDER, 'utf8')) : {};
    const numeros: string[] = Array.isArray(cfg?.numeros) ? cfg.numeros : [];
    const nomes: string[] = Array.isArray(cfg?.nomes) ? cfg.nomes : [];

    // Achado 18/09: chatJid pode ser um @lid (id interno do WhatsApp, sem relacao
    // numerica com o numero real) — comparar so o chatJid nunca batia com numero
    // digitado na lista pra contatos assim. Busca tambem o numeroReal (ja resolvido
    // e salvo nas mensagens desse chat) e confere os dois.
    const alvo = String(chatJid || '').includes('@lid') ? '' : (String(chatJid || '').split('@')[0] || '').replace(/[^0-9]/g, '');
    const msgComNumero = await prisma.mensagem.findFirst({
      where: { usuarioId, chatJid, numeroReal: { not: null } },
      orderBy: { timestamp: 'desc' },
      select: { numeroReal: true },
    });
    // numeroReal as vezes vem com sufixo de aparelho ("556196233237:0"): so a parte antes do ":".
    const numeroRealAlvo = (String(msgComNumero?.numeroReal || '').split(':')[0] || '').replace(/[^0-9]/g, '');
    const alvoLista = String(chatJid || '').replace(/[^0-9]/g, '');
    if (numeros.some((n) => { const limpo = String(n).replace(/[^0-9]/g, ''); return limpo.length >= 6 && ((alvoLista && alvoLista.includes(limpo)) || (numeroRealAlvo && numeroRealAlvo.includes(limpo))); })) {
      return true;
    }

    const internos = await numerosInternos();
    if ((alvo && internos.has(alvo)) || (numeroRealAlvo && internos.has(numeroRealAlvo))) return true;

    const ultima = await prisma.mensagem.findFirst({
      where: { usuarioId, chatJid, chatNome: { not: '' } },
      orderBy: { timestamp: 'desc' },
      select: { chatNome: true },
    });
    const nomeAtual = String(ultima?.chatNome || '').toLowerCase();
    if (nomeAtual && nomes.some((padrao) => nomeAtual.includes(String(padrao).toLowerCase()))) return true;
    // Nome com "peças"/"auto mecânica" NAO cala o robo: pode ser oficina comprando pneu. Fornecedor OFERECENDO
    // e reconhecido pela leitura da mensagem (fluxo 'fornecedor', silencio decidido pelo codigo).

    return false;
  } catch (e) {
    return false; // lista quebrada nao pode derrubar o atendimento
  }
}

// Anti-loop (18/09): a logica de DECISAO (dois eixos: volume/turnos reais e
// conteudo/eco+repeticao) mora em comportamentoGuard.ts (decidirAntiLoop) — la e
// logica pura, sem import de banco/servidor, entao um teste standalone pode
// cobrir sem efeito colateral nenhum. Aqui so busca no banco e delega.
const JANELA_ANTI_LOOP_MS = 5 * 60 * 1000;

async function ritmoDeLoop(usuarioId: string, chatJid: string): Promise<{ pausar: boolean; motivo: MotivoAntiLoop | null }> {
  const desde = new Date(Date.now() - JANELA_ANTI_LOOP_MS);
  const desdeComMargemEco = new Date(desde.getTime() - JANELA_ECO_MS);

  const [mensagensCliente, respostasBotComMargem] = await Promise.all([
    prisma.mensagem.findMany({
      where: { usuarioId, chatJid, fromMe: false, timestamp: { gte: desde } },
      select: { waId: true, texto: true, timestamp: true },
    }),
    prisma.mensagem.findMany({
      where: { usuarioId, chatJid, fromMe: true, enviadoPorId: 'bot', timestamp: { gte: desdeComMargemEco } },
      select: { texto: true, timestamp: true },
    }),
  ]);

  return decidirAntiLoop(mensagensCliente, respostasBotComMargem, desde);
}

async function executar(params: AgendarBotParams, versao: number) {
  const key = chave(params.usuarioId, params.chatJid);
  if (versoes.get(key) !== versao) return;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: params.usuarioId },
      select: { botIaAtivo: true, nome: true, lojaId: true },
    });
    if (!usuario?.botIaAtivo) return;
    if (!(await conversaLiberada(params.usuarioId, params.chatJid))) {
      console.log(`[Bot IA] ${params.chatJid}: robo NAO respondeu — conversa pausada (pausa em vigor).`);
      return;
    }

    // Se a gente ja respondeu demais nessa conversa em pouco tempo, e loop: pausa e
    // deixa um humano olhar, em vez de continuar alimentando a troca automatica.
    // Fornecedor/parceiro/sistema: registra no painel, mas nao responde.
    if (await naoAtender(params.usuarioId, params.chatJid)) {
      console.log(`[Bot IA] ${params.chatJid} esta na lista de nao-atender — deixando pros humanos.`);
      return;
    }

    // 21/10: loja com ROBO_INICIO (ex.: GP 10:30) — antes desse horario quem responde sao as atendentes.
    // O robo nao responde; quem ficar sem resposta e pego pelo Vigia depois do horario.
    const cfgLoja = await configBotDaLoja(params.usuarioId);
    if (antesDoInicioDoRobo(cfgLoja)) {
      console.log(`[Bot IA] ${params.chatJid}: antes das ${cfgLoja.ROBO_INICIO} (${cfgLoja.NOME_LOJA}) — atendente responde, robo fica quieto.`);
      return;
    }

    const ritmo = await ritmoDeLoop(params.usuarioId, params.chatJid);
    if (ritmo.pausar) {
      console.error(`[Bot IA][Anti-loop] ${params.chatJid}: motivo=${ritmo.motivo} — parece conversa com outro robo. Pausando 12h.`);
      const pausaLoop = await pausaSemEncurtar(params.usuarioId, params.chatJid, 12 * 60, ritmo.motivo || 'anti_loop');
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ...pausaLoop },
        update: pausaLoop,
      }).catch(() => {});
      return;
    }

    // Estado do fluxo deterministico de medida/preco (Task 6): sem isso, cada
    // mensagem chegava no bot-service como se fosse a PRIMEIRA da conversa —
    // o fluxo nunca lembrava que ja tinha perguntado a medida ou ja tinha achado
    // preco. Le o que ficou salvo da ultima vez pra mandar junto.
    const estadoPrecoSalvo = await prisma.botConversa.findUnique({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      select: { estadoPreco: true, dadosPreco: true },
    });

    const historico = await prisma.mensagem.findMany({
      where: { usuarioId: params.usuarioId, chatJid: params.chatJid },
      orderBy: { timestamp: 'desc' },
      take: 40,
    });
    historico.reverse();
    await transcreverAudiosDoCliente(historico, params.chatJid);
    if (versoes.get(key) !== versao) return; // chegou mensagem nova enquanto transcrevia: a rodada nova responde
    // Mensagens do Assistente de IA da Meta (enviadoPorId = meta_ai) NAO sao do nosso robo.
    // Se entrassem no historico como "assistant", o robo herdaria "Pneu Express" e
    // "conectei voce com a nossa equipe" como se tivesse dito isso (achado 08/09).
    for (let i = historico.length - 1; i >= 0; i--) { if ((historico[i] as any).enviadoPorId === 'meta_ai') historico.splice(i, 1); }

    // 21/10 (caso Maurício): conversa que um ATENDENTE (pessoa) atendeu nas ultimas N horas e dele — o robo nao entra.
    // O robo nao ve o orcamento em foto nem os audios da atendente: entrando, cotava outra marca e contradizia o que
    // ela ofereceu. Nao contam: mensagem do robo, saudacao automatica do WhatsApp Business e o 🙋🏼‍♀️ de remarketing.
    {
      const horas = cfgLoja.HUMANO_ASSUMIU_HORAS ?? 12;
      if (horas > 0) {
        const desde = Date.now() - horas * 3600_000;
        const humano = [...historico].reverse().find((m: any) => m.fromMe
          && m.enviadoPorId !== 'bot' && m.enviadoPorId !== 'meta_ai'
          && new Date(m.timestamp).getTime() >= desde
          && !MSG_AUTOMATICA_DA_LOJA.test(String(m.texto || '')));
        if (humano) {
          console.log(`[Bot IA] ${params.chatJid}: atendente atendeu ${new Date((humano as any).timestamp).toISOString()} (< ${horas}h) — conversa e dela, robo nao entra.`);
          return;
        }
      }
    }
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = historico.map((m: any) => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: String(m.texto || (m.tipo === 'imagem' ? '[imagem enviada]' : m.tipo === 'audio' ? '[audio enviado]' : `[${m.tipo}]`)),
    }));
    const ultima = [...historico].reverse().find((m: any) => !m.fromMe);
    // Mensagem do cliente mais antiga que esta rodada responde (o "rabo" de mensagens do cliente no fim da conversa,
    // ignorando respostas do robo gravadas depois delas): base da checagem de resposta duplicada.
    let inicioDaRodada: Date | null = null;
    for (let i = historico.length - 1; i >= 0; i--) {
      const m: any = historico[i];
      if (m.fromMe) { if (inicioDaRodada) break; continue; }
      inicioDaRodada = m.timestamp;
    }
    const ultimaDoClienteEm: Date = (ultima as any)?.timestamp || new Date();
    const ultimosTextosCliente = historico
      .filter((m: any) => !m.fromMe)
      // Achado 27/08: 4 mensagens era pouco pra negociacao longa (medida/quantidade
      // confirmadas 6+ mensagens atras "somem" da janela, e o preco cai pra IA calcular
      // de cabeca em vez de usar a tabela — risco real de errar conta de dinheiro).
      .slice(-15)
      .map((m: any) => String(m.texto || ''))
      .filter(Boolean)
      .join('\n');
    // Audio ja transcrito vai como TEXTO (acima); so foto (ou audio que nao deu pra transcrever) vai como midia.
    const midia = (ultima as any)?.__transcrito ? {} : midiaDaUltima(ultima);

    // Curriculo / candidato a vaga: o robo nao responde e fica quieto nessa conversa por 7 dias (a equipe cuida).
    {
      let ini = historico.length;
      while (ini > 0 && !(historico[ini - 1] as any).fromMe) ini--;
      const raboCliente = historico.slice(ini).map((m: any) => String(m.texto || ''));
      const pdfCurriculo = historico.slice(ini).some((m: any) => m.tipo === 'documento' && /curr/i.test(String(m.texto || '')));
      if (pdfCurriculo || ehCandidatoAVaga(raboCliente)) {
        const pausaCv = await pausaSemEncurtar(params.usuarioId, params.chatJid, 7 * 24 * 60, 'curriculo');
        await prisma.botConversa.upsert({
          where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
          create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ...pausaCv },
          update: pausaCv,
        }).catch(() => {});
        console.log(`[Bot IA] ${params.chatJid}: curriculo/vaga de emprego — robo nao responde (pausado 7 dias, equipe cuida).`);
        return;
      }
    }

    // Guarda contra corrida (achado 18/09, caso real do Gustavo Souza — 556181084128):
    // o cliente mandou a foto do anuncio e, 13,9s depois, a medida "225/45 17" numa
    // mensagem SEPARADA. O timer disparado pela foto ja estava rodando quando a medida
    // foi salva no banco, entao o historico lido acima nao a continha e o bot respondeu
    // com a lista generica por aro. Se uma mensagem do cliente ja chegou DEPOIS do
    // snapshot que acabamos de ler (mesmo que o agendamento dela ainda nao tenha
    // disparado), nao responde agora com um retrato desatualizado — reagenda (o novo
    // timer vai ler o historico de novo, ja com a mensagem nova dentro) e para por aqui.
    const ultimaDoSnapshot = historico[historico.length - 1];
    if (ultimaDoSnapshot) {
      const novaMsgDepoisDoSnapshot = await prisma.mensagem.count({
        where: {
          usuarioId: params.usuarioId,
          chatJid: params.chatJid,
          fromMe: false,
          timestamp: { gt: ultimaDoSnapshot.timestamp },
        },
      });
      if (novaMsgDepoisDoSnapshot > 0 && (params.reagendamentos || 0) < MAX_REAGENDAMENTOS_CONTEXTO) {
        // Reagenda apontando pra mensagem MAIS NOVA do cliente (nao pra que agendou esta rodada) —
        // assim o novo timer sempre enxerga a rajada inteira.
        const maisNova = await prisma.mensagem.findFirst({
          where: { usuarioId: params.usuarioId, chatJid: params.chatJid, fromMe: false },
          orderBy: { timestamp: 'desc' },
          select: { waId: true },
        });
        console.log(`[Bot IA] ${params.chatJid}: chegou mensagem nova durante a leitura — reagendando (${(params.reagendamentos || 0) + 1}/${MAX_REAGENDAMENTOS_CONTEXTO}).`);
        agendarRespostaBotIA({ ...params, waId: maisNova?.waId || params.waId, reagendamentos: (params.reagendamentos || 0) + 1 })
          .catch((e) => console.error('[Bot IA] reagendar (contexto desatualizado):', e));
        return;
      }
    }

    const lojasBrutas = await prisma.loja.findMany({
      select: { store_name: true, city: true, state: true, whatsapp: true, telefone_fixo: true },
    });
    const lojas = lojasBrutas.map((l) => ({
      nome: l.store_name,
      cidade: l.city,
      estado: l.state,
      whatsapp: l.whatsapp,
      telefone_fixo: l.telefone_fixo,
    }));

    const minutosDesdeLocalizacao = await minutosDesdeUltimaLocalizacao(params.usuarioId, params.chatJid);
    // Ha quanto tempo a loja (robo ou atendente) falou por ultimo: cumprimento/agradecimento repetido so vira
    // silencio se a loja falou ha pouco — quem volta no dia seguinte e diz "bom dia" e respondido (revisao 23/09).
    const ultimaDaLoja = [...historico].reverse().find((m: any) => m.fromMe);
    const minutosDesdeUltimaDaLoja = ultimaDaLoja?.timestamp
      ? Math.max(0, Math.round((Date.now() - new Date(ultimaDaLoja.timestamp).getTime()) / 60000))
      : null;

    const resposta = await gerarRespostaViaBotService({
      messages,
      ...midia,
      lojas,
      ultimosTextosCliente,
      estadoPreco: estadoPrecoSalvo?.estadoPreco || 'sem_estado',
      dadosPreco: estadoPrecoSalvo?.dadosPreco || '{}',
      textosFluxo: await carregarTextosFluxo(cfgLoja.lojaId),
      lojaBot: cfgLoja.porLoja ? { nome: cfgLoja.NOME_LOJA, telefone: cfgLoja.TELEFONE, horario: cfgLoja.HORARIO, localizacao: cfgLoja.LOCALIZACAO, localizacaoTexto: cfgLoja.LOCALIZACAO_TEXTO || '' } : undefined,
      minutosDesdeLocalizacao,
      minutosDesdeUltimaDaLoja,
    });

    // 21/10 (GP): cliente pediu pneu que NAO esta na tabela. O robo so manda o audio "so um instante que vou
    // verificar", marca o chat com a etiqueta vermelha e para de responder nessa conversa: a atendente assume.
    const CHAVES_FORA_DA_LISTA = ['medida_inexistente', 'sem_alternativa'];
    // + assuntos que ESTA loja passa pra equipe (City: servico de oficina, outra marca...): mesmo tratamento — o robo so diz
    // que vai verificar (nunca fala de atendente), etiqueta e fica quieto; a atendente entra logo depois.
    if (cfgLoja.ETIQUETA_FORA_DA_LISTA && resposta.deterministico && (resposta.chaves || []).some((c) => CHAVES_FORA_DA_LISTA.includes(c) || (cfgLoja.CHAVES_ATENDENTE || []).includes(c))) {
      if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) return;
      const audioOk = await enviarAudioDoFluxo(params, 'so-um-instante-verificando', 'Só um instante que eu vou verificar aqui pra você, tá bem?');
      if (!audioOk) await params.enviarParte('Só um instante que eu vou verificar aqui pra você, tá bem?', tempoDigitacao('Só um instante'));
      if (params.etiquetar) await params.etiquetar(cfgLoja.ETIQUETA_FORA_DA_LISTA).catch(() => false);
      const pausaMin = cfgLoja.PAUSA_FORA_DA_LISTA_MIN || 12 * 60;
      const pausaFora = await pausaSemEncurtar(params.usuarioId, params.chatJid, pausaMin, 'fora_da_lista');
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), ...pausaFora },
        update: { ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), ...pausaFora },
      }).catch(() => {});
      console.log(`[Bot IA] ${params.chatJid}: pneu fora da tabela — etiqueta "${cfgLoja.ETIQUETA_FORA_DA_LISTA.nome}" e robo pausado ${pausaMin} min (atendente assume).`);
      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', ['[ENVIAR_AUDIO:so-um-instante-verificando]', '(etiqueta: atendente assume)']);
      return;
    }

    if (resposta.deterministico && resposta.partes.length) {
      // Chegou mensagem nova (ou pausa) enquanto o fluxo lia a rajada: esta resposta ficou velha.
      // O novo agendamento vai ler a rajada COMPLETA (com a mensagem nova) e responder tudo junto.
      if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) {
        console.log(`[Bot IA] ${params.chatJid}: resposta pronta descartada — chegou mensagem nova ou pausa; o novo ciclo responde tudo.`);
        return;
      }
      // Outra rodada acabou de mandar exatamente isto (ver respostaJaEnviadaHaPouco): nao manda em dobro.
      if (await respostaJaEnviadaHaPouco(params.usuarioId, params.chatJid, resposta.partes, inicioDaRodada)) {
        console.log(`[Bot IA] ${params.chatJid}: resposta identica ja enviada ha menos de ${JANELA_RESPOSTA_DUPLICADA_S}s — nao repete.`);
        return;
      }
      // Cada parte vai como mensagem SEPARADA (achado 25/08: preco tem que ser gradual,
      // nunca a vista + parcelamento + desconto colados numa unica mensagem).
      // Depois de comecar, termina de mandar tudo (respostas do fluxo sao curtas e coerentes entre si).
      for (let i = 0; i < resposta.partes.length; i++) {
        const parte = resposta.partes[i] as string;
        const textoLimpo = parte.trim();
        if (!textoLimpo) continue;
        // AUDIO gravado pelo dono (decisao do CODIGO, ver aplicarAudioFluxo): manda como mensagem de voz.
        // "!N" = o audio substitui as N partes de texto seguintes — so pula se o audio foi mesmo enviado.
        const audio = interpretarMarcadorAudio(textoLimpo);
        if (audio) {
          if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) return;
          const textoSubstituido = audio.pular > 0 ? resposta.partes.slice(i + 1, i + 1 + audio.pular).filter((p) => !interpretarMarcadorAudio(p)).join('\n') : '';
          const audioEnviado = await enviarAudioDoFluxo(params, audio.arquivo, textoSubstituido);
          if (audioEnviado && audio.pular > 0) i += audio.pular;
          continue;
        }
        // O motor marca, na ordem certa, onde o pino da loja tem que sair (decisao do CODIGO).
        if (textoLimpo === '[ENVIAR_LOCALIZACAO]') {
          await dispararLocalizacaoDaLoja(params);
          continue;
        }
        const enviada = await enviarEmBolhas(params, textoLimpo.slice(0, 3500));
        if (!enviada) {
          console.error(`[Bot IA] ${params.chatJid}: envio falhou no meio da resposta do fluxo.`);
          return;
        }
      }
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: {
          usuarioId: params.usuarioId,
          chatJid: params.chatJid,
          ultimoInboundWaId: params.waId,
          ultimaRespostaEm: new Date(),
          ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
          ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
        },
        update: {
          ultimoInboundWaId: params.waId,
          ultimaRespostaEm: new Date(),
          ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
          ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
        },
      });
      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', resposta.partes);
      if (resposta.visita) await agendarLembretesVisita(params, resposta.visita, cfgLoja.NOME_LOJA);
      return;
    }

    // O CODIGO decidiu ficar em silencio (ex.: agradecimento repetido). Registra que a conversa foi tratada
    // (senao o Vigia acharia que o cliente ficou sem resposta e acionaria o robo de novo) e nao manda nada.
    if (resposta.deterministico && resposta.acaoTipo === 'SILENCIO') {
      // Chegou mensagem nova enquanto o robo decidia: a rodada nova cuida dela (nao esconde ela do Vigia).
      if (versoes.get(key) !== versao) return;
      await marcarConversaTratada(params, ultimaDoClienteEm);
      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', []);
      return;
    }

    const partes = resposta.partes.slice(0, 4);

    // Rodada anterior ja mandou exatamente isto (ver respostaJaEnviadaHaPouco). Resposta com marca de acao
    // (agendar/lembrar/video) nao entra nesta checagem: la o efeito nao e so o texto.
    if (!partes.some((p) => /\[(AGENDAR_VISITA|LEMBRAR|ENVIAR_VIDEO|VIDEO)/i.test(p)) && await respostaJaEnviadaHaPouco(params.usuarioId, params.chatJid, partes, inicioDaRodada)) {
      console.log(`[Bot IA] ${params.chatJid}: resposta identica ja enviada ha menos de ${JANELA_RESPOSTA_DUPLICADA_S}s — nao repete.`);
      return;
    }

    // Processa agendamento se presente
    let pinDestaResposta = false;
    for (const p of partes) {
      // Remarketing: o robo agenda o proprio retorno quando o cliente adia.
      if (p.includes('[LEMBRAR')) {
        await processarRemarketing(params.usuarioId, params.chatJid, p).catch(() => {});
      }
      if (p.includes('[AGENDAR_VISITA')) {
        await processarAgendamentoAutomatico(params.usuarioId, params.chatJid, p);
      }
      if (p.includes('[ENVIAR_LOCALIZACAO]')) {
        // Trava de codigo: a IA livre NAO decide repetir o pino. So manda se ainda nao foi
        // mandado nesta conversa e no maximo 1 vez por resposta.
        if (minutosDesdeLocalizacao === null && !pinDestaResposta) {
          pinDestaResposta = true;
          await dispararLocalizacaoDaLoja(params);
        } else {
          console.log(`[Bot IA] pino de localizacao ja enviado nesta conversa (ha ${minutosDesdeLocalizacao ?? 0} min) — nao repete.`);
        }
      }
    }

    const haConteudoUtil = partes.some((p: string) => limparTagsEspeciais(p) || extrairVideosDoTexto(p).length > 0);
    if (!haConteudoUtil) {
      // As travas do bot-service cortaram tudo (ex.: so horario nao pedido) — tambem e uma decisao de ficar quieto.
      // Registra no rastro do painel ("O que a IA decidiu" mostra "a IA respondeu: nada — as travas cortaram").
      if (resposta.motivoLivre === 'cortada_pelas_travas' && versoes.get(key) === versao) {
        await marcarConversaTratada(params, ultimaDoClienteEm);
        await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', []);
      }
      return;
    }

    for (const parte of partes) {
      if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) return;
      const videos = extrairVideosDoTexto(parte);
      const textoLimpo = limparTagsEspeciais(parte).slice(0, 3500);

      if (!videos.length) {
        if (!textoLimpo) continue;
        const enviada = await enviarEmBolhas(params, textoLimpo);
        if (!enviada) return;
        continue;
      }

      const primeiroVideo = videos[0];
      const usarTextoComoLegenda = videos.length === 1 && !!textoLimpo && !!primeiroVideo && !primeiroVideo.legenda;
      if (textoLimpo && !usarTextoComoLegenda) {
        const enviada = await enviarEmBolhas(params, textoLimpo);
        if (!enviada) return;
      }

      for (let i = 0; i < videos.length; i++) {
        if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) return;
        const atualVideo = videos[i];
        if (!atualVideo) continue;
        const video: VideoBotIA = {
          tipo: 'video',
          ...(atualVideo.caminho ? { caminho: atualVideo.caminho } : {}),
          ...(atualVideo.url ? { url: atualVideo.url } : {}),
          ...(atualVideo.legenda ? { legenda: atualVideo.legenda } : {}),
          ...(atualVideo.nome ? { nome: atualVideo.nome } : {}),
        };
        if (usarTextoComoLegenda && i === 0) video.legenda = textoLimpo;
        const enviada = await params.enviarVideo(video, tempoDigitacao(video.legenda || textoLimpo || 'video'));
        if (!enviada) return;
      }
    }

    await prisma.botConversa.upsert({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      create: {
        usuarioId: params.usuarioId,
        chatJid: params.chatJid,
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
        ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
      },
      update: {
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
        ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
      },
    });
    await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', partes.map((p: string) => limparTagsEspeciais(p)).filter(Boolean));
  } catch (e) {
    console.error(`[Bot IA] Erro em ${params.usuarioId}/${params.chatJid}:`, (e as any)?.message || e);
  } finally {
    setTimeout(() => {
      if (versoes.get(key) === versao && !timers.has(key)) versoes.delete(key);
    }, 24 * 60 * 60 * 1000).unref?.();
  }
}

export async function agendarRespostaBotIA(params: AgendarBotParams) {
  const key = chave(params.usuarioId, params.chatJid);
  // Trocar versao + timer e tudo SINCRONO (nenhum await no meio). Antes o timer so era criado
  // DEPOIS de esperar o banco: numa rajada de mensagens no mesmo instante, duas chamadas
  // calculavam a mesma versao e deixavam timers "orfaos" vivos, e o timer da mensagem mais
  // nova podia ser sobrescrito por um mais velho (achado 18/09, caso Marcia Lima).
  const atual = (versoes.get(key) || 0) + 1;
  versoes.set(key, atual);
  const anterior = timers.get(key);
  if (anterior) clearTimeout(anterior);

  // Agrupa a rajada natural do cliente antes de consultar a IA. Quando a ultima
  // mensagem e uma imagem sem medida no texto (cara de clique em anuncio — o cliente
  // ainda vai olhar o flanco do pneu e digitar a medida), da mais tempo: nos casos
  // reais levou entre 8 e 25s (achado 18/09, caso do Gustavo Souza).
  const esperaMaiorAnuncioSemMedida = params.ultimoTipo === 'imagem' && !params.ultimoTextoTemMedida;
  const espera = esperaMaiorAnuncioSemMedida
    ? 12000 + Math.floor(Math.random() * 4000)
    : 5500 + Math.floor(Math.random() * 3000);
  const timer = setTimeout(() => {
    if (timers.get(key) === timer) timers.delete(key);
    executar(params, atual).catch((e) => console.error('[Bot IA] executar:', e));
  }, espera);
  timer.unref?.();
  timers.set(key, timer);

  // Marca da ultima entrada (usada pelo painel/vigia). Depois do timer armado: se o banco
  // falhar aqui a resposta continua agendada — so registra o erro.
  try {
    await prisma.botConversa.upsert({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId },
      update: { ultimoInboundWaId: params.waId },
    });
  } catch (e) {
    console.error(`[Bot IA] ${params.chatJid}: falha ao gravar BotConversa no agendamento (resposta segue agendada):`, (e as any)?.message || e);
  }
}

// Pausa automatica nunca encurta a que ja esta valendo (21/10: o ∞ do painel era sobrescrito pelos
// 10 min de "atendente respondeu"). Devolve o pausadoAte/motivo que devem ficar gravados.
async function pausaSemEncurtar(usuarioId: string, chatJid: string, minutos: number, motivo: string): Promise<{ pausadoAte: Date; motivoPausa: string }> {
  const nova = new Date(Date.now() + minutos * 60 * 1000);
  const atual = await prisma.botConversa.findUnique({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    select: { pausadoAte: true, motivoPausa: true },
  }).catch(() => null);
  if (atual?.pausadoAte && atual.pausadoAte > nova) return { pausadoAte: atual.pausadoAte, motivoPausa: atual.motivoPausa || motivo };
  return { pausadoAte: nova, motivoPausa: motivo };
}

export async function pausarConversaBotIA(usuarioId: string, chatJid: string, minutos?: number, motivo = 'atendimento_manual') {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { botIaAtivo: true, botIaPausaManualMin: true },
  });
  if (!usuario?.botIaAtivo) return;

  // Achado 01/09: em contas onde o ROBO E O UNICO ATENDENTE, qualquer mensagem de saida
  // que nao veio do proprio robo (ex.: o eco de um sistema externo que escreve no mesmo
  // numero) caia na trava "uma pessoa assumiu" e silenciava o robo por 2h — matando ate a
  // resposta que ja estava agendada. Resultado real: clientes (Eraldo, Osmano) ficaram sem
  // NENHUMA resposta. Convencao: botIaPausaManualMin = 0 significa "nunca pause sozinho por
  // eco". A pausa pedida de proposito (painel, botoes 1h/4h/∞) continua funcionando porque
  // passa 'minutos' explicito ou vem das rotas do painel.
  // Eco (alguem digitou fora do painel: celular, extensao, ou um sistema externo no
  // mesmo numero). Antes isso pausava o robo por 2h e ele sumia; depois eu fiz nao
  // pausar nada, e ai ele passou a interromper a atendente no meio da conversa.
  // Meio-termo: pausa CURTA. Da espaco pra pessoa terminar sem sumir com o robo.
  if (motivo === 'eco_externo' && (usuario.botIaPausaManualMin ?? 120) === 0) {
    minutos = 10;
  }
  const key = chave(usuarioId, chatJid);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  versoes.set(key, (versoes.get(key) || 0) + 1);
  const duracao = Math.max(5, minutos ?? usuario?.botIaPausaManualMin ?? 120);
  const pausa = await pausaSemEncurtar(usuarioId, chatJid, duracao, motivo);
  await prisma.botConversa.upsert({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    create: { usuarioId, chatJid, ...pausa },
    update: pausa,
  });
}

export function cancelarBotDoUsuario(usuarioId: string) {
  for (const [key, timer] of timers.entries()) {
    if (!key.startsWith(`${usuarioId}:`)) continue;
    clearTimeout(timer);
    timers.delete(key);
    versoes.set(key, (versoes.get(key) || 0) + 1);
  }
}
