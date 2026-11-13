// Servico ISOLADO do robo de vendas (gera o TEXTO da resposta apenas).
// Roda num processo PROPRIO (pm2 "bot-service"), separado do whatsapp-crm de proposito:
// mudanca de prompt/logica do bot as vezes precisa de reload, e antes disso reiniciava
// o processo INTEIRO que segura as conexoes de WhatsApp de todo mundo, derrubando
// atendentes que nao tem nada a ver com o robo (achado e corrigido em 25-26/08/2026).
// Esse servico nao guarda nenhuma sessao de WhatsApp — reiniciar ele nunca desconecta ninguem.
import dotenv from 'dotenv';
import express from 'express';
import {
  montarBriefingComercialDeterministico,
  extrairMedidasDoTexto,
  encontrarPrecosExatosPorMedida,
} from '../data/tabelaPrecos';
import { precosForaDaTabela, valoresEmReais } from '../data/precoGuard';
import { prometeuTransferenciaFalsa, removerReperguntaPosPreco, removerRepeticaoRecente, removerPromessaDeFoto, removerHorarioNaoPedido, removerLocalizacaoRepetida, pareceAgradecimento } from '../data/comportamentoGuard';
import { lerBotPneusConfig, montarPromptAtendimentoBot } from '../services/botPneusConfig';
import { decidirSequenciaPreco, EstadoPrecoFluxo, DadosPrecoFluxo } from '../data/fluxoPreco';
import { extrairIntencoesPreco } from '../data/fluxoPrecoExtrator';
import { resolverDiaVisita } from '../data/visita';
import { juntarMedidaRecente, rajadaSoLarguraPerfil, partesPedirAro, medidasEscritasNaRajada, lojaAcabouDePerguntarAro, trocaDeAroDepoisDoPreco, partesPedirMedidaDoAro } from '../data/medidaJuntada';
import { removerParcelamentoRepetidoEJustificativa } from '../data/travaPosOrcamento';
import { negritoDinheiro, removerParcelamentoNaoPedido, aroSemMedidaNaRajada, removerBolhasRepetidas, CHAVES_GESTO, ehCandidatoAVaga, negouRetomada } from '../data/travasJosy2810';
import { rotasCerebro, licoesAtivasDaLoja, casarLicao, partesDaLicao, registrarUso } from './cerebro';
import { sanitizarTextosFluxo, chavesJaRespondidas, textoFluxo, SILENCIO_SE_REPETIR } from '../data/fluxoCatalogo';

// Atendente da loja (bot-lojas.json: NOME_ATENDENTE e ARTIGO_ATENDENTE), achada pelo NOME_LOJA que vem no payload.
// ===== GUARDA FINAL (13/11) — loja com IA_LIVRE_RESTRITA =====
// 1) ENCERROU VENCE: a ultima fala do cliente e so "ok obrigado" / "ja comprei" / "obrigado" (sem pergunta) -> o robo so
//    agradece UMA vez (ou fica quieto). Nada de garantia, audio, "manda o orcamento" (casos 9665-7009 e "Ok obrigado").
// 2) SEM REPETIR ARGUMENTO: "garantia de 2 anos" e "vem/vindo ate a loja" no maximo 1x por resposta, e a garantia nao
//    volta se a loja ja falou dela na conversa (caso Agnaldo: 5 bolhas repetindo garantia e loja).
const ENCERRAMENTO = /^(ok+|okay|blz|beleza|t[aá] (bom|bem|certo)|certo|entendi|tranquilo|show|perfeito|obrigad[oa]|muito obrigad[oa]|obg|vlw|valeu|j[aá] comprei|j[aá] resolvi|n[aã]o (quero|preciso)( mais)?|por enquanto n[aã]o|deixa|depois eu (vejo|volto|passo))([\s,!.]*(obrigad[oa]|muito obrigad[oa]|obg|vlw|valeu|tchau|at[eé] mais|bom dia|boa tarde|boa noite))*[\s!.🙏👍😊🤗❤️]*$/iu;
const FALA_GARANTIA = /garantia de 2 anos/i;
const FALA_VIR_NA_LOJA = /(vem|venha|vindo|passar?) at[eé] a loja|pessoalmente a gente consegue negociar/i;
// 3) BASE DE TROCA (13/11, anuncio "Pneu aro 14 e aro 15"): so nas medidas do anuncio, deixando o pneu usado na loja.
const BASE_TROCA_GP: Record<string, number> = { '165/70/14': 189, '185/65/15': 199 };
const TEXTO_BASE_TROCA = 'Os valores do anúncio são à base de troca: o *165/70/14* sai por *R$ 189,00* e o *185/65/15* por *R$ 199,00*, deixando o seu pneu usado aqui na troca 😉';
const NEGA_BASE_TROCA = /eram na base de troca|n[aã]o (trabalha|trabalhamos|fazemos|faz|aceita|aceitamos)( mais)? (com )?(a )?(base de troca|troca d[eo] pneu usado|pneu usado)/i;
const CLIENTE_FALA_DE_TROCA = /base de troca|troca d[oe] (meu )?(pneu )?usado|deixar? (o )?(meu )?(pneu )?usado|\b189\b|\b199\b|propaganda|an[uú]ncio/i;
const TEXTO_TROCA_NA_DESCRICAO = 'Está sim, na descrição do anúncio: os valores são à base de troca — o *165/70/14* por *R$ 189,00* e o *185/65/15* por *R$ 199,00*, deixando o seu pneu usado aqui na troca 😉';
const DIZ_QUE_ANUNCIO_NAO_FALA = /(an[uú]ncio|propaganda|post|foto)[^?.!]{0,40}n[aã]o (fala|diz|tem|mostra|aparece|est[aá]|falou|dizia|tinha)|n[aã]o (fala|diz|tem|mostra|aparece|est[aá]|falou|dizia|tinha|vi)[^?.!]{0,40}(an[uú]ncio|propaganda|base de troca|troca)|onde (fala|diz|est[aá]) (que [eé] )?(a )?(base de )?troca/i;
function aplicarBaseDeTroca(partes: string[], textoCliente: string, ditasAntes: string): string[] {
  let saida = partes.map((p) => (NEGA_BASE_TROCA.test(String(p)) ? TEXTO_BASE_TROCA : p));
  saida = saida.filter((p, i) => p !== TEXTO_BASE_TROCA || saida.indexOf(p) === i);
  const tudo = saida.join('\n');
  if (tudo.includes(TEXTO_BASE_TROCA) || ditasAntes.includes('deixando o seu pneu usado')) return saida;
  for (const [medida, valor] of Object.entries(BASE_TROCA_GP)) {
    if (new RegExp(medida.replace(/\//g, '\\/') + '\\*?.{0,80}R\\$', 'i').test(tudo)) {
      saida.push(`Na *base de troca* (deixando o seu pneu usado aqui), o ${medida} sai por *R$ ${valor},00* cada.`);
      return saida;
    }
  }
  if (CLIENTE_FALA_DE_TROCA.test(textoCliente) && /troca|an[uú]ncio|propaganda/i.test(textoCliente + tudo)) saida.unshift(TEXTO_BASE_TROCA);
  return saida;
}
// 4) PERGUNTOU O NOME ("Nome ?", "Atendente ?", "com quem falo?") -> responde o nome da atendente da loja.
// 5) PERGUNTOU SE ABRE / HORARIO ("voces abrem amanha?") -> o horario, nunca "Combinado, te esperamos".
const PERGUNTA_NOME = /(qual (e |é )?(o )?(seu|teu) nome|seu nome\s*\?|^\s*nome\s*[?:]|com quem (eu )?(falo|estou falando|to falando)|quem (est[aá] |ta )?(falando|atendendo|me atendendo)|^\s*atendente\s*\?)/im;
const PERGUNTA_HORARIO = /(voc[eê]s |vcs |a loja )?(abre|abrem|abriu|funciona|funcionam|est[aã]o abert|t[aá] abert|fecha|fecham)\b[^\n]{0,40}(\?|amanh|hoje|s[aá]bado|domingo|feriado|segunda|que horas)|hor[aá]rio (de )?(atendimento|funcionamento)|at[eé] que horas/i;
let nomeAtendenteGuarda = 'Josy';
function guardaRespostaRestrita(body: any, messages: any[], textosFluxo: any): any {
  try {
    const listaG = Array.isArray(messages) ? messages : [];
    const ultG = String([...listaG].reverse().find((m: any) => m?.role === 'user')?.content || '');
    const semAudio = (o: any) => { for (const k of Object.keys(o)) if (/audio/i.test(k)) delete o[k]; return o; };
    if (body && Array.isArray(body.partes) && PERGUNTA_NOME.test(ultG) && !body.partes.join(' ').includes(nomeAtendenteGuarda)) {
      return semAudio({ ...body, partes: [`Aqui é a ${nomeAtendenteGuarda} 😊 Em que posso te ajudar?`], acaoTipo: 'RESPONDER_NOME', chaves: ['nome_atendente'] });
    }
    const textoHorario = (textoFluxo(textosFluxo, 'horario') || []).join(' ');
    if (body && Array.isArray(body.partes) && PERGUNTA_HORARIO.test(ultG) && textoHorario && !body.partes.join(' ').includes(textoHorario.slice(0, 25))) {
      return semAudio({ ...body, partes: textoFluxo(textosFluxo, 'horario'), acaoTipo: 'RESPONDER_HORARIO', chaves: ['horario'] });
    }
  } catch { /* segue a guarda normal */ }
  return guardaRespostaRestritaBase(body, messages, textosFluxo);
}
function guardaRespostaRestritaBase(body: any, messages: any[], textosFluxo: any): any {
  try {
    if (!body || !Array.isArray(body.partes)) return body;
    const lista = Array.isArray(messages) ? messages : [];
    const ultimaCliente = [...lista].reverse().find((m: any) => m?.role === 'user');
    const textoCliente = String(ultimaCliente?.content || '').trim();
    const ditasAntes = lista.filter((m: any) => m?.role === 'assistant').slice(-12).map((m: any) => String(m?.content || '')).join('\n');
    if (textoCliente && !textoCliente.includes('?') && ENCERRAMENTO.test(textoCliente) && body.acaoTipo !== 'SILENCIO') {
      const jaAgradeceu = chavesJaRespondidas(textosFluxo, ditasAntes).includes('agradecimento');
      const saida: any = { ...body, partes: jaAgradeceu ? [] : textoFluxo(textosFluxo, 'agradecimento'), acaoTipo: jaAgradeceu ? 'SILENCIO' : 'RESPONDER_AGRADECIMENTO', chaves: ['encerrou_vence'] };
      for (const k of Object.keys(saida)) if (/audio/i.test(k)) delete saida[k];
      saida.partes = saida.partes.filter((p: string) => !/\[ENVIAR_AUDIO/i.test(String(p)));
      return saida;
    }
    let jaGarantia = FALA_GARANTIA.test(ditasAntes), jaLoja = false;
    const partes = body.partes.filter((p: any) => {
      const t = String(p || '');
      if (FALA_GARANTIA.test(t)) { if (jaGarantia) return false; jaGarantia = true; }
      if (FALA_VIR_NA_LOJA.test(t)) { if (jaLoja) return false; jaLoja = true; }
      return true;
    });
    // 13/11 (dono): "no anuncio nao fala isso" -> esta na descricao do anuncio.
    if (DIZ_QUE_ANUNCIO_NAO_FALA.test(textoCliente) && /troca/i.test(textoCliente + '\n' + ditasAntes)) {
      const saida: any = { ...body, partes: [TEXTO_TROCA_NA_DESCRICAO], acaoTipo: 'RESPONDER_BASE_TROCA', chaves: ['base_troca_descricao'] };
      for (const k of Object.keys(saida)) if (/audio/i.test(k)) delete saida[k];
      return saida;
    }
    const comTroca = aplicarBaseDeTroca(partes, textoCliente, ditasAntes);
    return comTroca.length === body.partes.length && comTroca.every((p, i) => p === body.partes[i]) ? body : { ...body, partes: comTroca };
  } catch { return body; }
}
// 13/11 (caso "175/64 aro 14" -> "so um instante"): perfil fora do padrao (nao multiplo de 5) e erro de digitacao -> o mais proximo.
function corrigirPerfilDigitado(t: string): string {
  return String(t || '').replace(/\b(1[3-9]\d|2[0-9]\d|3[0-3]\d)\s*\/\s*(\d{2})\b/g, (todo, larg, perf) => {
    const p = Number(perf);
    if (p % 5 === 0 || p < 25 || p > 85) return todo;
    return `${larg}/${Math.round(p / 5) * 5}`;
  });
}

// Loja com IA_LIVRE_RESTRITA no bot-lojas.json (achada pelo NOME_LOJA do payload).
function iaLivreRestrita(nomeLoja?: string): boolean {
  if (!nomeLoja) return false;
  try {
    const lojas = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/bot-lojas.json'), 'utf8'));
    return Object.values<any>(lojas || {}).some((v) => v && v.NOME_LOJA === nomeLoja && v.IA_LIVRE_RESTRITA === true);
  } catch { return false; }
}

function atendenteDaLoja(nomeLoja: string): { nome: string; artigo: string } | null {
  try {
    const lojas = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/bot-lojas.json'), 'utf8'));
    for (const v of Object.values<any>(lojas || {})) {
      if (v && v.NOME_LOJA === nomeLoja && v.NOME_ATENDENTE) return { nome: String(v.NOME_ATENDENTE), artigo: v.ARTIGO_ATENDENTE === 'a' ? 'a' : 'o' };
    }
  } catch { /* sem arquivo: segue o nome do config geral */ }
  return null;
}
import { chaveDoFluxo, ehChaveAnthropic, gerarTextoAnthropic, MensagemAnthropic } from '../services/llmAnthropic';

dotenv.config();

const app = express();
app.use(express.json({ limit: '15mb' }));
// Cerebro do robo (painel): ensinamentos do dono + revisao diaria das conversas. O nginx manda /api/cerebro pra ca.
app.use('/api/cerebro', rotasCerebro(`http://127.0.0.1:${process.env.BOT_SERVICE_PORT || process.env.PORT || 3010}/gerar-resposta`));

// Dados da loja do numero que recebeu a mensagem (vem do whatsapp-crm; null = config geral).
interface LojaBot { nome: string; telefone: string; horario: string; localizacao: string; localizacaoTexto: string }

interface RespostaBotBridge {
  partes: string[];
}

function extrairTextoOpenAI(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const partes: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const texto = typeof content?.text === 'string'
        ? content.text
        : typeof content?.output_text === 'string'
          ? content.output_text
          : '';
      if (texto.trim()) partes.push(texto.trim());
    }
  }
  return partes.join('\n').trim();
}

// Bolha com cara de codigo nunca vai pro cliente (21/10: um cliente recebeu "<invoke name=..." e o JSON cru).
export const LIXO_TECNICO = /<\/?(invoke|parameter|function_calls|antml)|```|"partes"\s*:|^\s*[{[]/i;

// Quebra de linha crua DENTRO de uma frase do JSON ("Desculpa!<enter>Aqui...") e invalida no JSON.parse:
// escapa so o que esta dentro de aspas.
function escaparQuebrasNasFrases(s: string): string {
  let out = '', dentro = false, escape = false;
  for (const ch of s) {
    if (dentro && !escape && (ch === '\n' || ch === '\r')) { out += ch === '\n' ? '\\n' : ''; continue; }
    if (ch === '"' && !escape) dentro = !dentro;
    escape = ch === '\\' && !escape;
    out += ch;
  }
  return out;
}

function parsearRespostaBot(payload: string): RespostaBotBridge {
  const bruto = String(payload || '').trim();
  if (!bruto) return { partes: [] };
  const limpar = (lista: any[]) => lista.map((p) => String(p || '').trim()).filter((p) => p && !LIXO_TECNICO.test(p)).slice(0, 4);
  const tentar = (s: string): string[] | null => {
    for (const t of [s, escaparQuebrasNasFrases(s)]) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p?.partes)) return limpar(p.partes);
        if (Array.isArray(p) && p.every((x: any) => typeof x === 'string')) return limpar(p); // ["...","..."] (22/10, caso Spin)
      } catch {}
    }
    return null;
  };
  // A IA as vezes "chama uma ferramenta" em vez de escrever o JSON: <parameter name="partes">[...]</parameter> (22/10).
  const noParametro = /<parameter\s+name="partes"\s*>([\s\S]*?)<\/parameter>/i.exec(bruto);
  if (noParametro && noParametro[1]) {
    const r = tentar(noParametro[1].trim()) || tentar(`{"partes":${noParametro[1].trim()}}`);
    if (r && r.length) return { partes: r };
  }
  // A IA as vezes escreve algo antes/depois do JSON (cerca ```json, "<invoke ...>"): acha o {"partes": ...} onde estiver.
  const ini = bruto.search(/\{\s*"partes"\s*:/);
  if (ini >= 0) {
    const resto = bruto.slice(ini);
    for (let fim = resto.lastIndexOf('}'); fim > 0; fim = resto.lastIndexOf('}', fim - 1)) {
      const r = tentar(resto.slice(0, fim + 1));
      if (r) return { partes: r };
    }
  }
  const semCerca = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const r = tentar(semCerca);
  if (r) return { partes: r };
  // Texto puro (sem JSON) so passa se nao tiver cara de codigo.
  if (LIXO_TECNICO.test(semCerca) || /[{}]/.test(semCerca)) {
    console.error('[BotService] resposta da IA ilegivel — nada enviado:', bruto.slice(0, 300));
    return { partes: [] };
  }
  return { partes: [semCerca.slice(0, 3500)] };
}

// Transcreve audio do cliente (WhatsApp manda em audio/ogg). A API de "responses" nao
// aceita ogg como input_file — devolvia 400 e o cliente que mandou audio ficava sem
// resposta nenhuma (achado 01/09). Aqui usamos a rota de transcricao, que aceita ogg,
// e injetamos o texto na conversa. Se a transcricao falhar, devolve null e o fluxo
// segue pedindo pro cliente repetir por escrito — nunca derruba a resposta inteira.
async function transcreverAudio(apiKey: string, base64: string, mime: string): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64, 'base64');
    const extensao = String(mime).includes('mp4') || String(mime).includes('m4a') ? 'm4a'
      : String(mime).includes('mpeg') || String(mime).includes('mp3') ? 'mp3'
      : String(mime).includes('wav') ? 'wav'
      : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mime || 'audio/ogg' }), `audio-cliente.${extensao}`);
    form.append('model', process.env.OPENAI_MODEL_AUDIO || 'whisper-1');
    form.append('language', 'pt');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      const detalhe = await r.text().catch(() => '');
      console.error('[BotService] Falha ao transcrever audio:', r.status, detalhe.slice(0, 200));
      return null;
    }
    const dados: any = await r.json().catch(() => null);
    const texto = String(dados?.text || '').trim();
    return texto || null;
  } catch (e: any) {
    console.error('[BotService] Erro ao transcrever audio:', e?.message || e);
    return null;
  }
}

// Converte o `input` no formato da Responses API (OpenAI) pro formato de mensagens da Anthropic.
// O system vai separado; a conversa tem que comecar por "user" e nao pode ter bloco de texto vazio.
// 22/10: o WhatsApp manda print (PNG) rotulado como foto (JPEG) e a Anthropic recusa a imagem com 400 — o
// cliente ficava sem resposta. O tipo certo sai dos primeiros bytes do arquivo, nao do rotulo.
function tipoRealDaImagem(base64: string, rotulo: string): string {
  const inicio = base64.slice(0, 16);
  if (inicio.startsWith('/9j/')) return 'image/jpeg';
  if (inicio.startsWith('iVBORw0KGgo')) return 'image/png';
  if (inicio.startsWith('R0lGOD')) return 'image/gif';
  if (inicio.startsWith('UklGR')) return 'image/webp';
  return rotulo;
}

export function paraMensagensAnthropic(input: any[]): MensagemAnthropic[] {
  const saida: MensagemAnthropic[] = [];
  for (const item of input) {
    if (item?.role !== 'user' && item?.role !== 'assistant') continue;
    const blocos: any[] = [];
    for (const c of Array.isArray(item.content) ? item.content : []) {
      if (c?.type === 'input_image') {
        const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(String(c.image_url || ''));
        if (m) blocos.push({ type: 'image', source: { type: 'base64', media_type: tipoRealDaImagem(m[2]!, m[1]!), data: m[2]! } });
      } else if (typeof c?.text === 'string' && c.text.trim()) {
        blocos.push({ type: 'text', text: c.text });
      }
    }
    if (blocos.length) saida.push({ role: item.role, content: blocos });
  }
  while (saida.length && saida[0]!.role !== 'user') saida.shift();
  // 22/10: quando a loja (robo ou atendente) falou DEPOIS da ultima mensagem do cliente, a conversa termina em
  // "assistant" e a Anthropic recusa com 400 ("does not support assistant message prefill") — o cliente ficava
  // sem resposta. Fecha com uma nota do sistema: responde so o que ainda falta, ou nada.
  if (saida.length && saida[saida.length - 1]!.role === 'assistant') {
    saida.push({ role: 'user', content: [{ type: 'text', text: '(Nota do sistema, nao e o cliente: as mensagens da loja acima ja foram enviadas depois da ultima fala do cliente. Se ainda falta responder algo que o cliente perguntou, responda so isso, sem repetir o que a loja ja disse. Se nao falta nada, devolva {"partes": []}.)' }] });
  }
  return saida;
}

async function gerarRespostaViaOpenAI(args: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  imagem?: any;
  audio?: any;
  lojas: Array<{ nome: string | null; cidade: string | null; estado: string | null; whatsapp: string | null; telefone_fixo: string | null }>;
  briefingComercial: string;
  lojaBot?: LojaBot | null;
}): Promise<RespostaBotBridge> {
  const apiKey = chaveDoFluxo();
  if (!apiKey) throw new Error('Nenhuma chave de IA configurada (ANTHROPIC_API_KEY ou OPENAI_API_KEY).');
  const usarAnthropic = ehChaveAnthropic(apiKey);
  // Transcricao de audio do cliente continua no Whisper da OpenAI (a Anthropic nao transcreve audio).
  // 21/10: o audio ja chega transcrito pelo whisper local (whatsapp-crm). OpenAI so se ligada de proposito.
  const chaveWhisper = process.env.TRANSCRICAO_OPENAI === '1' ? process.env.OPENAI_API_KEY?.trim() : undefined;

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  // 21/10: no numero de outra loja (GP, City...) o prompt usa nome/telefone/horario/endereco DESSA loja.
  const lb = args.lojaBot;
  const configGeral = lerBotPneusConfig();
  const config = lb ? { ...configGeral, NOME_LOJA: lb.nome, TELEFONE: lb.telefone || configGeral.TELEFONE || '', HORARIO: lb.horario || configGeral.HORARIO || '', LOCALIZACAO: lb.localizacao || configGeral.LOCALIZACAO || '' } : configGeral;
  let promptBase = montarPromptAtendimentoBot(config);
  if (lb) {
    promptBase = promptBase.replace(/Borracharia Popular/g, lb.nome);
    // 10/11 (dono): no numero da Josy quem atende e a Josy, nao o Charles. O prompt geral fala "Charles": loja com
    // NOME_ATENDENTE no bot-lojas.json troca o nome (e o artigo: ARTIGO_ATENDENTE "a" = fala no feminino).
    const atendente = atendenteDaLoja(lb.nome);
    if (atendente) {
      promptBase = promptBase
        .replace(/\b([oO]) Charles\b/g, (_m: string, o: string) => `${o === 'O' ? atendente.artigo.toUpperCase() : atendente.artigo} ${atendente.nome}`)
        .replace(/\bCharles\b/g, atendente.nome);
      if (atendente.artigo === 'a') promptBase += `\n\nSeu nome e ${atendente.nome} e voce e mulher: fale sempre no feminino ("sou a ${atendente.nome}", "obrigada", "vendedora").`;
    }
    // 30/10: o prompt geral e da Borracharia (Novo Gama). Loja com config propria fala o proprio endereco e telefone
    // (Itamar e Paulo Cesar ouviram Novo Gama da GP, que fica em Luziania).
    if (lb.localizacaoTexto) promptBase = promptBase.replace(/em frente ao posto de gasolina Pont[aã]o 24h Lunabel,? Novo Gama-GO,? 520 - Lunabel/gi, String(lb.localizacaoTexto));
    if (lb.telefone) promptBase = promptBase.replace(/61 3774-2114/g, String(lb.telefone));
    // 03/11 (dono): montagem por conta da loja SO no pneu GP Premium; outra marca a montagem e cobrada.
    if (/GP Premium/i.test(String(lb.nome))) promptBase = promptBase.replace(/- MONTAGEM:[^\n]*/, '- MONTAGEM: por nossa conta SO na compra de pneu GP Premium. Pneu de outra marca: a montagem e cobrada, valor combinado com os meninos da oficina. Nunca diga que a montagem e gratis sem ser no GP Premium.');
    if (/GP Premium/i.test(String(lb.nome))) promptBase = promptBase.replace(/- ALINHAMENTO:[^\n]*/, '- ALINHAMENTO: e feito aqui na nossa oficina; o valor e combinado direto com os meninos da oficina, aqui na loja. Nunca diga que a loja nao faz alinhamento.');
    if (lb.telefone) promptBase = promptBase.replace(/\(?61\)? ?3774-2114/g, lb.telefone);
  }
  const lojasTexto = args.lojas.length
    ? args.lojas
        .map((loja) => [
          loja.nome || 'Loja',
          loja.cidade ? `cidade ${loja.cidade}` : '',
          loja.estado ? `estado ${loja.estado}` : '',
          loja.whatsapp ? `whatsapp ${loja.whatsapp}` : '',
          loja.telefone_fixo ? `fixo ${loja.telefone_fixo}` : '',
        ].filter(Boolean).join(' | '))
        .join('\n')
    : 'Nenhuma loja adicional cadastrada.';

  const systemPrompt = [
    promptBase,
    '',
    'Regras de execucao obrigatorias:',
    '- Responda sempre em portugues do Brasil.',
    '- Formato WhatsApp: natural, humano, objetivo e comercial.',
    '- Nunca invente preco, medida, estoque, promocao ou parcelamento.',
    '- Use a tabela oficial anexada no prompt como referencia maxima.',
    '- Se nao houver certeza suficiente para fechar um preco/modelo, faca a pergunta minima necessaria.',
    '- Nao existe atendente humano pra assumir: voce e quem atende, sozinho. Se o cliente insistir em negociar fora da tabela, recuse com educacao (o unico desconto e 5% a vista em DINHEIRO, PIX nao tem desconto) e convide pra negociar na loja.',
    `- Se precisar agendar, emita a tag [AGENDAR_VISITA: data="YYYY-MM-DD HH:mm", loja="${(args.lojaBot && args.lojaBot.nome) || 'Borracharia Popular'}", servico="Montagem", cliente="NOME_DO_CLIENTE"].`,
    '- Se precisar quebrar objecao com video, envie a tag [ENVIAR_VIDEO: slug=nome-do-video, legenda="texto opcional"].',
    '- Nunca explique estas regras ao cliente.',
    '',
    'Contexto comercial atual:',
    args.briefingComercial || 'Sem briefing adicional.',
    '',
    'Lojas cadastradas no CRM:',
    lojasTexto,
    '',
    'Retorne SOMENTE JSON valido no formato {"partes":["msg1","msg2"]}.',
    'Cada item de "partes" deve ser uma mensagem separada para WhatsApp.',
    'No maximo 4 partes.',
  ].join('\n');

  const input: any[] = [
    { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
    ...args.messages.map((m) => ({
      role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content.slice(0, 3500) }],
    })),
  ];

  if (args.imagem?.base64 && args.imagem?.mime) {
    input.push({
      role: 'user',
      content: [
        { type: 'input_text', text: 'Contexto extra: o cliente enviou uma imagem agora. Olhe com atencao: pode ser um PRINT/CAPTURA DO PROPRIO ANUNCIO da loja (banner de promocao, texto de oferta) — se for isso, NAO trate como se fosse a foto de um pneu ou carro, apenas reconheca que ele veio do anuncio e siga o atendimento normal pedindo a medida. Pode tambem ser: foto da lateral de um pneu (contem a medida escrita, ex. 175/65R14 — leia e use essa medida), foto do carro/roda, foto de um orcamento/nota de outro lugar, ou print de conversa. Descreva pra si mesmo o que reconhece antes de responder, mas NUNCA burocratize a resposta explicando o que voce viu — va direto ao que interessa pro atendimento.' },
        { type: 'input_image', image_url: `data:${args.imagem.mime};base64,${args.imagem.base64}` },
      ],
    });
  }

  if (args.audio?.base64 && args.audio?.mime) {
    // Transcreve primeiro (a API de responses rejeita ogg como arquivo) e manda o TEXTO.
    const transcricao = chaveWhisper ? await transcreverAudio(chaveWhisper, args.audio.base64, args.audio.mime) : null;
    if (transcricao) {
      input.push({
        role: 'user',
        content: [
          { type: 'input_text', text: `O cliente mandou um audio agora. Transcricao do que ele falou: "${transcricao.slice(0, 1200)}". Responda ao conteudo do audio normalmente, como se ele tivesse escrito isso — NAO comente que era audio nem que voce transcreveu.` },
        ],
      });
    } else {
      input.push({
        role: 'user',
        content: [
          { type: 'input_text', text: 'O cliente mandou um audio agora, mas nao foi possivel entender o conteudo. Peça de forma natural e educada pra ele repetir por escrito.' },
        ],
      });
    }
  }

  if (usarAnthropic) {
    const texto = await gerarTextoAnthropic({
      apiKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      system: systemPrompt,
      mensagens: paraMensagensAnthropic(input),
    });
    return parsearRespostaBot(texto);
  }

  const resposta = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      text: { format: { type: 'text' } },
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const body = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`openai ${resposta.status}: ${body?.error?.message || 'resposta invalida'}`);
  }

  return parsearRespostaBot(extrairTextoOpenAI(body));
}

app.get('/health', (_req, res) => res.json({ ok: true }));

// Medida que ja apareceu na conversa (mais recente primeiro). Cliente vale mais que a loja: o que a loja escreveu
// pode ser lista de alternativas, entao da loja so conta quando a mensagem tem UMA medida so. Só medida que existe
// na tabela (senao o robo cotaria algo que nao vende).
// "(ex.: 175/65/14)" na pergunta do robo NAO e medida de ninguem (22/10: virou "14 pneus 175/65/14").
function semExemplos(texto: string): string {
  return String(texto || '').replace(/\(\s*(ex|exemplo)\b[^)]*\)/gi, ' ').replace(/\b(ex|exemplo)\.?\s*:\s*[\d/ .,rR-]+/gi, ' ');
}

// Modelo citado pelo cliente (ou pelo anuncio que ele clicou): Brutus, ATR, H/T, A/T, Verde, Duramax, Drift, Zero.
function modeloCitado(textos: string[]): string | undefined {
  const t = textos.join('\n');
  const regras: Array<[RegExp, string]> = [[/brutus/i, 'BRUTUS'], [/\batr\b/i, 'ATR'], [/\bh\s*\/\s*t\b|\bht\b/i, 'H/T'], [/\ba\s*\/\s*t\b/i, 'A/T'], [/\bverde\b/i, 'VERDE'], [/duramax|\bcargo\b/i, 'DURAMAX'], [/drift/i, 'DRIFT'], [/\bzero\b/i, 'ZERO']];
  let achado: string | undefined;
  for (const [re, nome] of regras) if (re.test(t)) achado = nome;
  return achado;
}

function medidaDoHistorico(mensagens: any[]): string | null {
  const valida = (m: string) => encontrarPrecosExatosPorMedida(m).length > 0;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m?.role !== 'user') continue;
    const achadas = extrairMedidasDoTexto(semExemplos(String(m?.content || ''))).filter(valida);
    if (achadas.length) return achadas[achadas.length - 1] as string;
  }
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m?.role !== 'assistant') continue;
    const achadas = extrairMedidasDoTexto(semExemplos(String(m?.content || ''))).filter(valida);
    if (achadas.length === 1) return achadas[0] as string;
  }
  return null;
}

// O robo precisa saber QUE DIA E HOJE pra agendar remarketing ("dia 10", "semana que
// vem", "quando eu receber"). Sem isso ele chutava a data ou nem conseguia agendar.
// Tudo em horario de Brasilia, que e como a loja e o cliente pensam.
function contextoDeData(): string {
  const agora = new Date();
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...opts }).format(agora);
  const diaSemana = fmt({ weekday: 'long' });
  const dataLonga = fmt({ day: '2-digit', month: 'long', year: 'numeric' });
  const hora = fmt({ hour: '2-digit', minute: '2-digit' });
  // formato AAAA-MM-DD, que e o que a marca [LEMBRAR] espera
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return `DATA_DE_HOJE: hoje e ${diaSemana}, ${dataLonga} (${iso}), e agora sao ${hora} no horario de Brasilia. Use isso pra calcular qualquer data que o cliente citar ("dia 10", "semana que vem", "amanha") e pra montar a data da marca [LEMBRAR] no formato AAAA-MM-DD HH:MM.`;
}

// Separa o "rabo" de mensagens do cliente que ainda nao foram respondidas (tudo depois da ultima
// mensagem do robo/atendente) do resto da conversa. Legenda automatica de clique em anuncio
// nao e pergunta e sai da rajada. Placeholder de midia sem texto ("[imagem enviada]") vira aviso:
// o codigo nao sabe o que tem na foto/audio, entao a rajada vai pra IA livre.
const LEGENDA_ANUNCIO = /^\s*📢\s*\[An[uú]ncio\]/i;
const PLACEHOLDER_MIDIA = /^\[[^\]]+\]$/;
// Frase que o proprio WhatsApp preenche no clique do anuncio (o cliente so aperta enviar).
// Cobre as variantes reais ("Olá! Tenho interesse e queria mais informações, por favor." e 9 de 10 anuncios da
// Super Via; "Oi, posso obter mais informações sobre isto?").
const FRASE_PADRAO_ANUNCIO = /^((ol[aá]|oi)[!,.]?\s*)?(posso (ter|obter) mais informa[cç][oõ]es( sobre (isso|isto))?|tenho interesse( e queria mais informa[cç][oõ]es)?|quero (saber mais|mais informa[cç][oõ]es))(,?\s*por favor)?[.!?\s]*$/i;
// So pontuacao/sinal: sem letra, numero, emoji nem "?" (o "?" sozinho e o cliente cobrando resposta).
const SO_PONTUACAO = (t: string) => !!String(t || '').trim() && !/[\p{L}\p{N}\p{Extended_Pictographic}?]/u.test(String(t));
// Mensagem de clique em anuncio: "📢 [Anúncio] <titulo do anuncio>\n\n<texto do cliente>". Se o cliente
// escreveu algo proprio no lugar da frase padrao, o texto dele e pergunta de verdade e fica na rajada
// (revisao 23/09: antes a mensagem inteira saia e a pergunta dele se perdia). O titulo do anuncio
// ("Pneus a partir de R$ 239") nunca entra — nao e o cliente pedindo aquele preco.
function textoProprioNoAnuncio(t: string): string {
  if (!LEGENDA_ANUNCIO.test(t)) return t;
  const resto = t.split('\n').slice(1).join('\n').trim();
  return resto && !FRASE_PADRAO_ANUNCIO.test(resto) ? resto : '';
}
function separarRajada(messages: any[]): { rajada: string[]; rabo: string[]; anteriores: any[]; temMidiaSemTexto: boolean } {
  let inicio = messages.length;
  while (inicio > 0 && messages[inicio - 1]?.role === 'user') inicio--;
  const rabo = messages.slice(inicio).map((m) => String(m?.content ?? '').trim()).filter(Boolean);
  // So conta quando a ULTIMA mensagem e a midia sem texto (igual ao comportamento anterior, que
  // olhava a ultima); midia sem texto no meio da rajada apenas sai da lista.
  const temMidiaSemTexto = rabo.length > 0 && PLACEHOLDER_MIDIA.test(rabo[rabo.length - 1] as string);
  // Pontuacao solta ("." depois do clique no anuncio) tambem nao e assunto: sai, e se nao sobrar nada
  // a rajada inteira (com a legenda) vai pra leitura — o clique no anuncio ainda merece o cumprimento.
  // (a pontuacao e filtrada DEPOIS de tirar o titulo do anuncio: "📢 [Anúncio] X\n\n." tambem nao e assunto)
  const uteis = rabo.filter((t) => !PLACEHOLDER_MIDIA.test(t)).map(textoProprioNoAnuncio).filter((t) => t && !SO_PONTUACAO(t));
  // 13/11 (Josy: "perguntou onde fica a loja e saiu no audio vou verificar"): o cliente perguntou, o robo respondeu outra
  // coisa (a pergunta chegou enquanto ele respondia) e o cliente mandou so "?". O "?" cobra a pergunta anterior: ela volta
  // pra rajada (a ultima fala do cliente antes das respostas da loja).
  if (uteis.length && uteis.every((t) => /^[\s?!.]*\?[\s?!.]*$/.test(t))) {
    let k = inicio - 1;
    while (k >= 0 && messages[k]?.role !== 'user') k--;
    const anterior = k >= 0 ? textoProprioNoAnuncio(String(messages[k]?.content ?? '').trim()) : '';
    if (anterior && !PLACEHOLDER_MIDIA.test(anterior) && !SO_PONTUACAO(anterior)) uteis.unshift(anterior);
  }
  return { rajada: (uteis.length ? uteis : rabo).slice(-6), rabo, anteriores: messages.slice(0, inicio), temMidiaSemTexto };
}

// Cumprimento/agradecimento repetido so vira silencio se a loja falou ha pouco: o cliente que volta
// no dia seguinte e diz "bom dia" tem que ser respondido (revisao 23/09).
const JANELA_SILENCIO_REPETIDO_MIN = 240;

app.post('/gerar-resposta', async (req, res) => {
  try {
    const { messages, imagem, audio, lojas, ultimosTextosCliente } = req.body || {};
    const estadoPrecoAtual: EstadoPrecoFluxo = (req.body?.estadoPreco as EstadoPrecoFluxo) || 'sem_estado';
    let dadosPrecoAtuais: DadosPrecoFluxo = {};
    try { dadosPrecoAtuais = JSON.parse(req.body?.dadosPreco || '{}'); } catch { dadosPrecoAtuais = {}; }
    // Respostas editadas pelo dono na tela "Fluxo" do painel (quem tem Prisma manda no payload;
    // este servico e stateless). Sem edicao / payload invalido = texto padrao.
    const textosFluxo = sanitizarTextosFluxo(req.body?.textosFluxo);
    const lb = req.body?.lojaBot;
    if (lb && iaLivreRestrita(lb.nome)) {
      nomeAtendenteGuarda = atendenteDaLoja(lb.nome)?.nome || 'Josy';
      for (const m of Array.isArray(messages) ? messages : []) if (m?.role === 'user' && typeof m.content === 'string') m.content = corrigirPerfilDigitado(m.content);
      const jsonOriginal = res.json.bind(res);
      (res as any).json = (body: any) => jsonOriginal(guardaRespostaRestrita(body, messages, textosFluxo));
    }
    const lojaBot: LojaBot | null = lb && typeof lb === 'object' && typeof lb.nome === 'string' && lb.nome.trim()
      ? { nome: String(lb.nome).trim(), telefone: String(lb.telefone || ''), horario: String(lb.horario || ''), localizacao: String(lb.localizacao || ''), localizacaoTexto: String(lb.localizacaoTexto || '') }
      : null;
    if (lojaBot?.horario) textosFluxo.horario = [`A gente atende ${lojaBot.horario}.`];
    if (lojaBot?.localizacaoTexto) textosFluxo.localizacao_repetida = [`Te mandei o pino da localização aqui em cima na conversa. A gente fica ${lojaBot.localizacaoTexto}.`];
    // Ha quantos minutos o pino de localizacao ja foi mandado nesta conversa (null = nunca).
    const minutosDesdeLocalizacao: number | null = typeof req.body?.minutosDesdeLocalizacao === 'number' ? req.body.minutosDesdeLocalizacao : null;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages (array) e obrigatorio.' });
    }

    const textosCliente = String(ultimosTextosCliente || '');
    // Gatilho = so a mensagem MAIS RECENTE do cliente (ultimo item role:'user' do proprio
    // array messages que ja recebemos), usada pra decidir SE e pedido de preco. Sem isso,
    // uma medida mencionada 2-3 mensagens atras "contaminava" qualquer pergunta seguinte
    // sem relacao — ex.: cliente perguntou "e remold?" e recebia preco de novo, porque a
    // janela de contexto (ultimosTextosCliente) ainda continha a medida (achado 26/08).
    const ultimaDoCliente = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => m?.role === 'user')
      : null;
    // RAJADA (18/09, caso Marcia Lima): o cliente manda varias mensagens seguidas ate o robo
    // responder (preco, marca, endereco...). Antes so a ULTIMA era lida e o resto ficava sem
    // resposta. Agora o fluxo le todas as mensagens do cliente que vieram DEPOIS da ultima
    // resposta (robo ou atendente) e responde cada assunto. Mensagem ja respondida nunca entra
    // (nao contamina — achado 26/08).
    const { rajada, rabo, anteriores, temMidiaSemTexto } = separarRajada(messages);
    // PEDIDOS DA JOSY 27-28/10 (data/travasJosy2810.ts): toda resposta que sai daqui (fluxo, cerebro, IA livre) passa
    // por: parcelamento so se o cliente pediu, sem bolha repetida (que nao seja preco) e "dinheiro" em negrito.
    {
      const ultimasDaLoja = anteriores.filter((m: any) => m?.role === 'assistant').map((m: any) => String(m?.content ?? ''));
      const textosClientePos = [...anteriores.filter((m: any) => m?.role === 'user').slice(-3).map((m: any) => String(m?.content ?? '')), ...rajada];
      const minutosLoja: number | null = typeof req.body?.minutosDesdeUltimaDaLoja === 'number' ? req.body.minutosDesdeUltimaDaLoja : null;
      const lojaRecente = minutosLoja == null || minutosLoja < 240;
      const temTexto = (ps: string[]) => ps.some((p) => !/^\[[A-Z_]+(:[^\]]*)?\]$/.test(String(p).trim()));
      const jsonOriginal = res.json.bind(res);
      (res as any).json = (body: any) => {
        try {
          if (body && Array.isArray(body.partes) && body.partes.length) {
            const parc = removerParcelamentoNaoPedido(body.partes, textosClientePos);
            if (parc.cortadas.length) console.log(`[BotService][Josy] parcelamento nao pedido cortado: ${JSON.stringify(parc.cortadas)}`);
            let partes = parc.partes;
            if (lojaRecente) {
              const rep = removerBolhasRepetidas(partes, ultimasDaLoja);
              if (rep.cortadas.length) {
                if (temTexto(rep.partes)) partes = rep.partes;
                else if (body.deterministico && Array.isArray(body.chaves) && body.chaves.length && body.chaves.every((c: string) => CHAVES_GESTO.includes(c))) {
                  partes = [];
                  body.acaoTipo = 'SILENCIO';
                  body.chaves = [...body.chaves, 'sem_repetir'];
                }
                if (partes !== parc.partes) console.log(`[BotService][Josy] repeticao cortada: ${JSON.stringify(rep.cortadas)}`);
              }
            }
            if (!temTexto(partes) && temTexto(body.partes) && body.acaoTipo !== 'SILENCIO') partes = body.partes; // nunca zera por engano
            body.partes = partes.map(negritoDinheiro);
          }
          if (body && Array.isArray(body.partesAntesDoInstante)) {
            body.partesAntesDoInstante = removerParcelamentoNaoPedido(body.partesAntesDoInstante, textosClientePos).partes.map(negritoDinheiro);
          }
        } catch (e: any) {
          console.error('[BotService][Josy] pos-processamento falhou (resposta segue sem ele):', e?.message || e);
        }
        return jsonOriginal(body);
      };
    }
    // 05/11 (dono: "se ele relutar manda vir ate a loja negociar pessoalmente"): depois de o robo ja ter dito
    // "Nesse valor eu nao consigo", o cliente que insiste no preco e convidado pra negociar na loja.
    {
      const ultimasDaLoja = messages.filter((m: any) => m?.role === "assistant").slice(-6).map((m: any) => String(m?.content ?? ""));
      const jaRecusou = ultimasDaLoja.some((t: string) => /Nesse valor eu n[aã]o consigo/i.test(t));
      const insiste = /\b(faz|fazer|faria|consegue|deixa|sai|fecha|vende|pode ser)\b[^?]{0,30}\bpor\s*(r\$\s*)?(\d[\d.,]*|mil)\b|\b(baixa|abaixa|abaixar|baixar|melhora|melhorar|chora|desconto maior|mais desconto|menos que isso|[uú]ltim[oa] (pre[cç]o|proposta)|t[aá] caro|muito caro|mais barato)\b/i.test(rajada.join(" "));
      if (jaRecusou && insiste) {
        const onde = lojaBot?.localizacaoTexto ? ` A gente fica ${lojaBot.localizacaoTexto}.` : "";
        console.log("[BotService] cliente insistiu no preco depois da recusa — convite pra negociar na loja.");
        return res.json({ partes: [`Entendo! Então passa aqui na loja que pessoalmente a gente conversa e tenta chegar num acordo com você 😉${onde}`, "Quando você consegue vir?"], deterministico: true, acaoTipo: "NEGOCIAR_NA_LOJA", novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: "fluxo", assuntos: ["NEGOCIAR"], chaves: ["negociar_na_loja"], rajada, simulado: !!req.body?.simular });
      }
    }
    // Candidato a vaga / curriculo em QUALQUER mensagem recente do cliente: o robo nao entra (28/10, candidato que
    // recebeu o 🙋 e depois "qual e o seu carro?"). O whatsapp-crm so olhava as mensagens novas.
    {
      const doCliente = messages.filter((m: any) => m?.role === 'user').slice(-15).map((m: any) => String(m?.content ?? ''));
      if (ehCandidatoAVaga(doCliente)) {
        console.log('[BotService] candidato a vaga na conversa — silencio (a equipe cuida).');
        return res.json({ partes: [], deterministico: true, acaoTipo: 'SILENCIO', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: [], chaves: ['curriculo'], rajada, simulado: !!req.body?.simular });
      }
    }
    // "Nao" respondendo a retomada ("...Ainda está precisando?"): agradece uma vez e para — nunca pede a medida (Lindomar 27/10).
    {
      const ultimaDaLojaRet = String([...anteriores].reverse().find((m: any) => m?.role === 'assistant')?.content || '');
      if (negouRetomada(rajada, ultimaDaLojaRet)) {
        return res.json({ partes: textoFluxo(textosFluxo, 'agradecimento'), deterministico: true, acaoTipo: 'RESPONDER_AGRADECIMENTO', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: ['AGRADECEU_OU_ENCERROU'], chaves: ['agradecimento', 'retomada_negada'], rajada, simulado: !!req.body?.simular });
      }
    }
    // 30/10: "nao" a confirmacao da medida ouvida no audio: pede escrita ou foto, nunca cota a medida errada.
    {
      const ultimaDaLojaConf = String([...anteriores].reverse().find((m: any) => m?.role === 'assistant')?.content || '');
      if (/^Entendi \*?\d{3}\/\d{2}\/\d{2}\*?, é isso\?/.test(ultimaDaLojaConf) && rajada.length && rajada.every((t: string) => /^(n[aã]o+|nn|n|errado|n[aã]o [eé]( n[aã]o)?)[\s!.,]*$/i.test(String(t).trim()))) {
        return res.json({ partes: ['Sem problema! Me manda a medida escrita ou uma foto da lateral do pneu, que eu te passo o valor certinho 😉'], deterministico: true, acaoTipo: 'PEDIR_MEDIDA', novoEstadoPreco: 'aguardando_medida', novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: ['MEDIDA_DE_AUDIO'], chaves: ['medida_audio_negada'], rajada, simulado: !!req.body?.simular });
      }
    }
    // 23/10 (retomada de clientes): "sim" / "quero" / "preciso" respondendo a mensagem de RETOMADA da loja
    // ("...os pneus 185/65/15. Ainda está precisando?") vale como se o cliente tivesse mandado essa medida -> preco
    // pela tabela. Sem isso a IA livre respondia "pode repetir, por favor?". Sem medida na retomada, segue normal.
    {
      const ultimaDaLoja = String([...anteriores].reverse().find((m: any) => m?.role === 'assistant')?.content || '');
      const AFIRMATIVO = /^(sim|s|ss|sim sim|quero|quero sim|sim quero|preciso|preciso sim|sim preciso|ainda preciso|ainda estou precisando|t[oô] precisando|estou precisando|t[oô] sim|pode ser|pode|pode sim|manda|pode mandar|me passa|passa|claro|claro que sim|isso|opa|uhum|aham|yes|ok|blz|beleza|bora|vamos|vamos sim|tenho interesse|tenho sim|[eé] isso|isso mesmo|exato|certo|correto|[eé] sim)[\s!.,😊👍🙏]*$/i;
      // 30/10 (Fernando De Jesus): "Bom dia" + "Vamos sim" a "Vamos seguir com o seu orçamento?" recebia a mesma pergunta de volta.
      const CUMPRIMENTO = /^(bom dia|boa tarde|boa noite|oi|ol[aá]|opa)[\s!.,😊👍🙏]*$/i;
      const respostaSemCumprimento = rajada.filter((t: string) => !CUMPRIMENTO.test(String(t).trim()));
      if (/Ainda está precisando\?|Vamos seguir com o seu orçamento\?|^Entendi \*?\d{3}\/\d{2}\/\d{2}\*?, é isso\?/i.test(ultimaDaLoja) && respostaSemCumprimento.length && respostaSemCumprimento.every((t: string) => AFIRMATIVO.test(String(t).trim()))) {
        const medidaRetomada = extrairMedidasDoTexto(ultimaDaLoja)[0] || dadosPrecoAtuais.medida || medidaDoHistorico(anteriores);
        if (medidaRetomada) {
          console.log(`[BotService] retomada: "${rajada.join(' / ')}" -> medida ${medidaRetomada} da mensagem da loja`);
          rajada.splice(0, rajada.length, medidaRetomada);
        }
      }
    }
    const gatilho = rajada.length ? rajada.join('\n') : String(ultimaDoCliente?.content ?? textosCliente);
    // A ultima mensagem do cliente e uma FOTO (com legenda): o codigo nao enxerga a foto — que muitas vezes
    // e a lateral do pneu, com a medida. Pedir a medida ou so cumprimentar por cima dela seria ignorar o que
    // ele mandou; nesses casos a IA livre (que ve a imagem) responde (revisao 23/09).
    // A mensagem de clique no anuncio e gravada como "imagem" (a miniatura do anuncio) — isso NAO e foto do
    // cliente: sem esta exclusao todo lead de anuncio caia na IA livre (revisao 23/09 pegou em producao).
    const temFoto = !!imagem && !LEGENDA_ANUNCIO.test(String(ultimaDoCliente?.content ?? ''));
    // Ha quantos minutos a loja (robo ou atendente) mandou a ultima mensagem nesta conversa; null = nao informado.
    const minutosDesdeUltimaDaLoja: number | null = typeof req.body?.minutosDesdeUltimaDaLoja === 'number' ? req.body.minutosDesdeUltimaDaLoja : null;

    // FLUXO DETERMINISTICO DE PRECO (Camadas 1+2, Tasks 3-4, ligado aqui no Task 5). So
    // roda se valer a pena chamar a IA extratora; se ela decidir que a mensagem e sobre
    // medida/preco, a resposta sai 100% do codigo (motor + tabela) — nunca chega no
    // caminho livre abaixo, que e onde a IA podia inventar numero ou escolher o modelo
    // errado (ver commits 688b1eef/46b91911 do dia 15/09, agora supersedidos por isto
    // pra qualquer caso que o fluxo abaixo decida tratar).
    // Foto/audio sem texto na rajada: o codigo nao ve o conteudo — deixa a IA livre (que ve/ouve).
    // Rastro pro fluxograma ao vivo do painel: o que a IA leu e por que (se for o caso) caiu na IA livre.
    let assuntosLidos: string[] = [];
    let motivoLivre = temMidiaSemTexto ? 'midia_sem_texto' : 'mensagem_vazia';
    // Rajada so de pontuacao ("." / "!!"), sem letra, numero, emoji nem "?": o codigo decide nao responder
    // (23/09: o cliente mandou "." e a IA livre respondeu "pode repetir, por favor?"). Olha a rajada INTEIRA
    // (com legenda de anuncio e midia) — "." depois do clique no anuncio ou de uma foto nao e silencio.
    const soPontuacao = !temMidiaSemTexto && !temFoto && rabo.length > 0 && rabo.every(SO_PONTUACAO);
    if (soPontuacao) {
      return res.json({
        partes: [],
        deterministico: true,
        acaoTipo: 'SILENCIO',
        novoEstadoPreco: estadoPrecoAtual,
        novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
        via: 'fluxo',
        assuntos: [],
        chaves: ['so_pontuacao'],
        rajada,
        simulado: !!req.body?.simular,
      });
    }
    // MEDIDA EM PEDACOS (22/10, caso 556198132318): "195/55" numa mensagem e "aro 16" em outra (qualquer ordem)
    // = 195/55/16. Junta das mensagens recentes do cliente (data/medidaJuntada.ts). `medidaJuntada` so vale quando
    // o cliente acabou de mandar um dos pedacos (senao uma conversa qualquer depois re-cotaria a medida).
    const partesMedida = juntarMedidaRecente(rajada, anteriores, minutosDesdeUltimaDaLoja);
    // Juntada que a loja NAO tem so vale como resposta a "Qual é o aro?". Fora disso o aro pode ser do anuncio que o cliente
    // citou ("o aro 13 é esse preço?" + "e o 195/55?" virava 195/55/13 = "so um instante" + etiqueta + pausa): o aro e
    // descartado e o robo pergunta o aro, mostrando os que tem (conferencia 22/10).
    if (partesMedida.medida && !encontrarPrecosExatosPorMedida(partesMedida.medida).length && !lojaAcabouDePerguntarAro(anteriores)) {
      console.log(`[BotService] pedacos ${partesMedida.medida}: a loja nao tem e ninguem perguntou o aro — descarta o aro ${partesMedida.aro}.`);
      partesMedida.aro = null;
      partesMedida.medida = null;
    }
    let medidaJuntada = partesMedida.medida && partesMedida.daRajada ? partesMedida.medida : null;
    // Medidas inteiras que o cliente escreveu de fato na rajada (o que a leitura da IA "completou" nao conta).
    const medidasEscritas = medidasEscritasNaRajada(rajada);
    if (medidaJuntada) console.log(`[BotService] medida ${medidaJuntada} juntada de pedacos (${partesMedida.larguraPerfil} + aro ${partesMedida.aro}).`);
    // So "195/55" (sem aro em lugar nenhum da conversa recente): pede SO o aro, sem o texto generico com exemplo.
    {
      const lp = rajadaSoLarguraPerfil(rajada);
      if (lp && !partesMedida.aro && !temFoto && !temMidiaSemTexto && !(dadosPrecoAtuais.medida || '').startsWith(`${lp}/`)) {
        const dadosAro: DadosPrecoFluxo = {};
        if (dadosPrecoAtuais.quantidade) dadosAro.quantidade = dadosPrecoAtuais.quantidade;
        if (dadosPrecoAtuais.modelo) dadosAro.modelo = dadosPrecoAtuais.modelo;
        if (dadosPrecoAtuais.intencaoPendente) dadosAro.intencaoPendente = dadosPrecoAtuais.intencaoPendente;
        if (dadosPrecoAtuais.parcelasPendentes) dadosAro.parcelasPendentes = dadosPrecoAtuais.parcelasPendentes;
        return res.json({
          partes: partesPedirAro(lp),
          deterministico: true, acaoTipo: 'PEDIR_ARO', novoEstadoPreco: 'aguardando_medida', novosDadosPreco: JSON.stringify(dadosAro),
          via: 'fluxo', assuntos: ['INFORMOU_LARGURA_PERFIL'], chaves: ['pedir_aro'], rajada, simulado: !!req.body?.simular,
        });
      }
    }
    // "14" / "aro 15" sozinho e sem medida conhecida = ARO (22/10: virava "14 pneus"). Pergunta o carro numa frase.
    {
      const soAro = /^\s*(aro\s*)?(1[2-9]|2[0-2])\s*\.?\s*$/i.exec(rajada.join(' ').trim());
      // 27/10 (Josy, "acho que não compensa responder assim"): "O pneu aro 14" + "Tá quanto?" e "Tudo bem" + "Aro 15"
      // caiam na IA livre, que mandava a LISTA inteira do aro. Aro sozinho com cumprimento/pergunta de preco = pergunta o carro.
      const aroDaRajada = soAro ? soAro[2] : (!temFoto && !temMidiaSemTexto ? aroSemMedidaNaRajada(rajada) : null);
      if (aroDaRajada && !medidaJuntada && !dadosPrecoAtuais.medida && !medidaDoHistorico(anteriores)) {
        return res.json({
          partes: [`Show, aro ${aroDaRajada}! 👍`, 'Qual é o carro? Já te passo a medida certa e o valor.'],
          deterministico: true, acaoTipo: 'PEDIR_CARRO', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
          via: 'fluxo', assuntos: ['INFORMOU_ARO'], chaves: ['aro_sem_medida'], rajada, simulado: !!req.body?.simular,
        });
      }
    }
    // TROCA DE ARO DEPOIS DO PRECO (23/10): a loja cotou 185/65/15 e o cliente manda so "aro 16" / "e aro 16?" (a IA livre
    // respondia "pode repetir, por favor?"). Mesma largura/perfil no aro novo: se a tabela tem, essa medida vai pro fluxo de
    // preco como a medida juntada (cotada pela tabela); se nao tem, o codigo pede a medida completa mostrando o que tem no aro.
    if (!medidaJuntada && !temFoto && !temMidiaSemTexto && !lojaAcabouDePerguntarAro(anteriores)) {
      const lojaDeuPreco = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).some((m: any) => /R\$\s*\d/.test(String(m?.content ?? '')));
      const medidaDosDados = dadosPrecoAtuais.medida && encontrarPrecosExatosPorMedida(dadosPrecoAtuais.medida).length ? dadosPrecoAtuais.medida : null;
      const cotada = lojaDeuPreco ? (medidaDosDados || medidaDoHistorico(anteriores)) : null;
      const troca = cotada ? trocaDeAroDepoisDoPreco(rajada, cotada) : null;
      if (troca?.medida) {
        console.log(`[BotService] troca de aro: ${cotada} cotada + "${rajada.join(' / ')}" -> ${troca.medida}.`);
        medidaJuntada = troca.medida;
        partesMedida.aro = troca.aro;
      } else if (troca) {
        console.log(`[BotService] troca de aro: ${cotada} cotada + "${rajada.join(' / ')}" -> ${troca.larguraPerfil}/${troca.aro} nao tem; pede a medida (${troca.opcoes.join(', ')}).`);
        const dadosTroca: DadosPrecoFluxo = {};
        if (dadosPrecoAtuais.quantidade) dadosTroca.quantidade = dadosPrecoAtuais.quantidade;
        if (dadosPrecoAtuais.intencaoPendente) dadosTroca.intencaoPendente = dadosPrecoAtuais.intencaoPendente;
        if (dadosPrecoAtuais.parcelasPendentes) dadosTroca.parcelasPendentes = dadosPrecoAtuais.parcelasPendentes;
        return res.json({
          partes: partesPedirMedidaDoAro(troca),
          deterministico: true, acaoTipo: 'PEDIR_MEDIDA', novoEstadoPreco: 'aguardando_medida', novosDadosPreco: JSON.stringify(dadosTroca),
          via: 'fluxo', assuntos: ['INFORMOU_ARO'], chaves: ['pedir_medida_do_aro'], rajada, simulado: !!req.body?.simular,
        });
      }
    }
    // CEREBRO (22/10): ensinamento do dono que casa com a mensagem vale ANTES do fluxo (o dono manda).
    // responder = o texto dele; atendente = "so um instante" + etiqueta; silencio = nao responde; orientar = a IA segue a orientacao.
    let instrucaoCerebro = '';
    // Sem mensagem nova do cliente (a loja ja falou depois da ultima dele): ensinamento nao casa com mensagem velha (28/10, monologo).
    if (!temMidiaSemTexto && gatilho.trim() && rabo.length > 0) {
      // 30/10: retomada automatica nao responde mensagem do cliente (Marcos deu o carro e recebeu "Ainda posso te ajudar?");
      // pergunta de preco sem citar concorrente nao e "achou mais barato" ("Qual valor unidade").
      const textoRajada = rajada.join(' ');
      const perguntouPreco = /\b(qual|quanto|valor|pre[cç]o)\b/i.test(textoRajada);
      const citouConcorrente = /barat|outr[ao]s? loja|internet|an[uú]ncio|concorr|mercado livre|magazine|or[cç]amentos/i.test(textoRajada);
      const licoes = licoesAtivasDaLoja(lojaBot?.nome).filter((x) => !/n[aã]o responde [aà] pergunta/i.test(x.situacao) && !(perguntouPreco && !citouConcorrente && /mais barato/i.test(x.situacao)));
      if (licoes.length) {
        const ctx = anteriores.slice(-6).map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'LOJA'}: ${semExemplos(String(m.content || '')).slice(0, 300)}`).join('\n');
        const casada = await casarLicao(rajada.length ? rajada : [gatilho], ctx, licoes);
        // 30/10 (Ezilene mandou "215/55/17" e ouviu "me passa a medida"): medida da tabela na mensagem vale mais que ensinamento
        // de texto — o preco sai do fluxo. "atendente" e "silencio" continuam valendo (ex.: pneu off-road vai pra atendente).
        const medidaNaMensagem = [medidaJuntada, ...medidasEscritas].some((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
        const textoFalado = medidaNaMensagem && (casada?.acao === 'responder' || casada?.acao === 'orientar');
        // 30/10 (Consultor MS: 3x o mesmo audio da marca): ensinamento que a loja ja mandou nas ultimas mensagens nao repete.
        const faladoAntes = anteriores.filter((m: any) => m?.role === 'assistant').slice(-8).map((m: any) => String(m?.content || ''));
        const jaDita = casada?.acao === 'responder' && partesDaLicao(casada, false).some((p) => faladoAntes.includes(p));
        // 30/10: silencio aprovado em lote ("a atendente ja esta conduzindo") nao cala cliente que perguntou algo de verdade.
        const perguntaReal = /\?|\b(quanto|valor|pre[cç]o|medida|onde|aro|tem)\b|\d{3}/i.test(textoRajada);
        const calariaPergunta = casada?.acao === 'silencio' && (casada as any).soSemPergunta === true && perguntaReal;
        const l = casada && !textoFalado && !jaDita && !calariaPergunta ? casada : null;
        if (casada && !l) console.log(`[BotService][Cerebro] ensinamento ${casada.id} nao usado (${textoFalado ? 'tem medida' : calariaPergunta ? 'cliente perguntou' : 'ja dito'}).`);
        if (l) {
          console.log(`[BotService][Cerebro] ensinamento ${l.id} (${l.acao}): ${l.situacao}`);
          if (!req.body?.simular && !req.body?.teste) registrarUso(l.id);
          const baseCerebro = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'cerebro', assuntos: [l.situacao], rajada, simulado: !!req.body?.simular, licao: { id: l.id, situacao: l.situacao, acao: l.acao } };
          // Audio no ensinamento ([ENVIAR_AUDIO:josy-x!N], aprendizado da Josy): so vai se quem chamou sabe enviar
          // (audioFluxo, igual ao fluxo abaixo); senao sai so o texto de reserva.
          if (l.acao === 'responder') return res.json({ ...baseCerebro, partes: partesDaLicao(l, req.body?.audioFluxo === true), acaoTipo: 'CEREBRO', chaves: ['cerebro'] });
          if (l.acao === 'silencio') return res.json({ ...baseCerebro, partes: [], acaoTipo: 'SILENCIO', chaves: ['cerebro_silencio'] });
          if (l.acao === 'atendente') return res.json({ ...baseCerebro, partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], acaoTipo: 'CEREBRO', chaves: ['sem_alternativa'] });
          instrucaoCerebro = `\nORIENTACAO DO DONO DA LOJA PARA ESTA SITUACAO ("${l.situacao}") — siga a risca, acima das outras regras: ${l.resposta}`;
        }
      }
    }
    // Toda mensagem com texto passa pela leitura (23/09, "mais fechado"): antes um filtro de palavras-chave
    // (podeSerSobrePreco) mandava "oi", "é nacional?" e oferta de fornecedor direto pra IA livre.
    // 30/10: ensinamento "orientar" nao pula mais a leitura (Aldo: "A vista tem desconto?" caiu na IA livre e ela negou o desconto
    // em dinheiro). O fluxo responde o que tem bloco; a orientacao so vale pro que sobrar pra IA livre.
    if (!temMidiaSemTexto && gatilho.trim()) {
      const apiKeyFluxo = chaveDoFluxo();
      motivoLivre = apiKeyFluxo ? 'leitura_falhou' : 'sem_chave_openai';
      if (apiKeyFluxo) {
        const contextoRecente = anteriores
          .slice(-6)
          // Orcamento/audio da atendente lido pelo robo (21/10) e comprido: cabe inteiro, senao as marcas somem.
          .map((m: any) => { const t = semExemplos(String(m.content || '')); const daAtendente = /^\((foto que a atendente mandou|áudio da atendente)\)/.test(t); return `${m.role === 'user' ? 'CLIENTE' : daAtendente ? 'ATENDENTE' : 'ROBO'}: ${t.slice(0, daAtendente ? 900 : 200)}`; })
          .join('\n');
        const intencoes = await extrairIntencoesPreco(rajada.length ? rajada : [gatilho], contextoRecente, apiKeyFluxo);
        if (intencoes) {
          // A leitura as vezes devolve DAR_MEDIDA com a medida PELA METADE ("195/55"): o motor achava que era medida que a
          // loja nao tem (GP: "so um instante" + etiqueta + pausa). Medida que nao e LARGURA/PERFIL/ARO vira "sem medida" (22/10).
          for (const i of intencoes as any[]) {
            if (!i.medidaExtraida) continue;
            const m = /^\s*(\d{3})\s*\/\s*(\d{2})\s*\/?\s*R?\s*(\d{2})\s*$/i.exec(String(i.medidaExtraida));
            if (m) {
              const inteira = `${m[1]}/${m[2]}/${m[3]}`;
              // O cliente mandou "195/55" e a leitura devolveu medida INTEIRA que ele nao escreveu: o aro foi inventado pela IA
              // (legenda "oferta do 185/65/ R15" + "195/55" virava 195/55/15 ou 195/55/16) ou veio de outro pedaco
              // ("aro 16" -> "195/55" -> "nao, 205/55" saia 195/55/16). Vale a juntada do codigo, ou nenhuma (conferencia 22/10).
              if (partesMedida.larguraPerfilNaRajada && !medidasEscritas.includes(inteira) && inteira !== medidaJuntada) {
                i.medidaExtraida = null;
                if (i.intencao === 'DAR_MEDIDA') i.intencao = 'PERGUNTAR_PRECO_SEM_MEDIDA';
                continue;
              }
              i.medidaExtraida = inteira;
              continue;
            }
            const soLarguraPerfil = /^\s*\d{3}\s*\/\s*\d{2}\b/.test(String(i.medidaExtraida));
            i.medidaExtraida = null;
            if (i.intencao === 'DAR_MEDIDA' && soLarguraPerfil) i.intencao = 'PERGUNTAR_PRECO_SEM_MEDIDA';
          }
          // O que o robo (ou atendente) ja disse ha pouco: se o cliente insiste no mesmo assunto, a resposta
          // troca pela variante em vez de repetir a explicacao palavra por palavra.
          const textoRecenteDoRobo = anteriores.filter((m: any) => m?.role === 'assistant').slice(-12).map((m: any) => String(m?.content || '')).join('\n');
          // Respostas que viram SILENCIO se repetidas (agradecimento, cumprimento) so contam como "ja respondidas" se
          // foram a ULTIMA mensagem da loja E a loja falou ha menos de 4h: um "Tranquilo!" de horas atras nao pode
          // calar o robo diante de um "valeu" novo (revisao 21/09), nem o cliente que volta no dia seguinte e diz
          // "bom dia", nem o "bom dia" que responde a um lembrete mandado depois do cumprimento (revisao 23/09).
          const ultimaDaLojaTexto = anteriores.filter((m: any) => m?.role === 'assistant').slice(-1).map((m: any) => String(m?.content || '')).join('\n');
          const naUltimaDaLoja = chavesJaRespondidas(textosFluxo, ultimaDaLojaTexto);
          const lojaFalouHaPouco = minutosDesdeUltimaDaLoja == null || minutosDesdeUltimaDaLoja < JANELA_SILENCIO_REPETIDO_MIN;
          const jaRespondidas = chavesJaRespondidas(textosFluxo, textoRecenteDoRobo)
            .filter((c) => !SILENCIO_SE_REPETIR.includes(c) || (lojaFalouHaPouco && naUltimaDaLoja.includes(c)));
          // Cliente antigo (o robo nao tem estado dessa conversa): le a medida do historico antes de responder.
          let estadoUsado = estadoPrecoAtual;
          let dadosUsados = dadosPrecoAtuais;
          {
            const textosCliente = [...anteriores.filter((m: any) => m?.role === 'user').slice(-6).map((m: any) => String(m?.content || '')), ...rajada];
            const modelo = modeloCitado(textosCliente);
            if (modelo && modelo !== dadosUsados.modelo) dadosUsados = { ...dadosUsados, modelo };
          }
          if (!dadosPrecoAtuais.medida && (estadoPrecoAtual === 'sem_estado' || estadoPrecoAtual === 'aguardando_medida')) {
            // Pedacos recentes ("195/55" + "aro 16") valem antes de uma medida inteira mais antiga do historico.
            const juntadaNaTabela = partesMedida.medida && encontrarPrecosExatosPorMedida(partesMedida.medida).length ? partesMedida.medida : null;
            const medidaHistorico = juntadaNaTabela || medidaDoHistorico(anteriores);
            if (medidaHistorico) {
              estadoUsado = 'preco_confirmado';
              dadosUsados = { ...dadosPrecoAtuais, medida: medidaHistorico };
              console.log(`[BotService] medida ${medidaHistorico} lida do historico da conversa (nao pergunta de novo).`);
            }
          }
          // Medida juntada de pedacos (22/10): a leitura da IA ve cada mensagem sozinha e nao monta a medida — o codigo poe
          // a medida nos assuntos de preco ("Qual o valor do aro 16" + "195/55" = preco do 195/55/16, nunca "me passa a medida").
          if (medidaJuntada) {
            const aroNum = Number(partesMedida.aro);
            // Medida inteira so vale se o cliente a ESCREVEU na rajada; a que a leitura completou sozinha nao (conferencia 22/10).
            const escrita = (m: unknown) => typeof m === 'string' && medidasEscritas.includes(m) ? m : null;
            const comMedida = (i: any) => ({ ...i, medidaExtraida: escrita(i.medidaExtraida) || medidaJuntada, escolhaAlternativa: null, quantidadeExtraida: i.quantidadeExtraida === aroNum ? null : i.quantidadeExtraida });
            // "Aro 16" depois de "Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16." a leitura chama de ESCOLHER_ALTERNATIVA —
            // so e escolha de verdade quando a loja ofereceu medidas que nao tinha (estado medida_sem_match).
            const ehPreco = (t: string) => t === 'DAR_MEDIDA' || t === 'PERGUNTAR_PRECO_SEM_MEDIDA' || t === 'OUTRO_ASSUNTO' || t === 'RESPONDER_QUANTIDADE' || t === 'SO_SAUDACAO'
              || (t === 'ESCOLHER_ALTERNATIVA' && estadoPrecoAtual !== 'medida_sem_match');
            let jaPos = false;
            const ajustadas: any[] = [];
            for (const i of intencoes as any[]) {
              if (ehPreco(i.intencao)) {
                // Outra medida que o cliente escreveu inteira na mesma rajada ("185/65/15" + "195/55" + "aro 16") tambem e cotada.
                if (i.intencao === 'DAR_MEDIDA' && escrita(i.medidaExtraida) && i.medidaExtraida !== medidaJuntada) { ajustadas.push(i); continue; }
                if (!jaPos) ajustadas.push({ ...comMedida(i), intencao: 'DAR_MEDIDA' });
                jaPos = true;
              } else if (i.intencao === 'PERGUNTOU_PARCELAMENTO_ESPECIFICO' || i.intencao === 'PERGUNTOU_DESCONTO_AVISTA') {
                ajustadas.push(comMedida(i));
                jaPos = true;
              } else ajustadas.push(i);
            }
            if (!jaPos) ajustadas.unshift({ intencao: 'DAR_MEDIDA', medidaExtraida: medidaJuntada, quantidadeExtraida: null, escolhaAlternativa: null });
            console.log(`[BotService] leitura ${JSON.stringify(intencoes.map((i: any) => [i.intencao, i.medidaExtraida, i.escolhaAlternativa]))} -> ${JSON.stringify(ajustadas.map((i: any) => [i.intencao, i.medidaExtraida]))}`);
            intencoes.splice(0, intencoes.length, ...ajustadas);
          }
          // 27/10 ("Poderia me informa valor do pneu" + "185/65/15" + "4 unidades" -> "Qual a medida dos pneus?"): a leitura
          // perdeu a medida que o cliente ESCREVEU. Medida inteira da tabela escrita na rajada vira DAR_MEDIDA (com a quantidade).
          // "Pergunta de preco" que ja veio COM a medida da tabela e cotacao (a leitura as vezes marca assim e o filtro abaixo
          // descartava a unica intencao, caindo no "me passa a medida").
          for (const i of intencoes as any[]) {
            if (i.intencao === 'PERGUNTAR_PRECO_SEM_MEDIDA' && i.medidaExtraida && encontrarPrecosExatosPorMedida(String(i.medidaExtraida)).length) i.intencao = 'DAR_MEDIDA';
          }
          if (!medidaJuntada && !intencoes.some((i: any) => i.medidaExtraida)) {
            const daTabela = medidasEscritas.filter((m) => encontrarPrecosExatosPorMedida(m).length);
            if (daTabela.length === 1) {
              const q = /\b(\d{1,2})\s*(unidades?|pneus?|pe[cç]as?|un)\b/i.exec(rajada.join(' '));
              const qtd = q ? Number(q[1]) : null;
              intencoes.push({ intencao: 'DAR_MEDIDA', medidaExtraida: daTabela[0], quantidadeExtraida: qtd && qtd > 0 && qtd <= 20 ? qtd : null, escolhaAlternativa: null } as any);
              console.log(`[BotService] medida ${daTabela[0]} escrita na rajada e perdida pela leitura — cotando (qtd ${qtd ?? '-'}).`);
            }
          }
          // A rajada ja traz a medida ("qual o preco do aro 15?" + "185/60"): nao pede a medida antes do preco (22/10).
          const temMedidaNaRajada = intencoes.some((i: any) => i.medidaExtraida || i.intencao === 'DAR_MEDIDA');
          const intencoesUsadas = temMedidaNaRajada ? intencoes.filter((i: any) => i.intencao !== 'PERGUNTAR_PRECO_SEM_MEDIDA') : intencoes;
          const decisao = decidirSequenciaPreco(intencoesUsadas.length ? intencoesUsadas : intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });
          // So falta o aro (o cliente ja deu "195/55"): no lugar do pedido generico de medida, pede SO o aro.
          if (partesMedida.larguraPerfil && !partesMedida.aro) {
            for (const chave of ['pedir_medida', 'pedir_medida_repetida']) {
              if (!decisao.chaves.includes(chave)) continue;
              const generico = textoFluxo(textosFluxo, chave);
              const ini = decisao.partes.findIndex((p: string) => p === generico[0]);
              if (ini < 0) continue;
              decisao.partes.splice(ini, generico.length, ...partesPedirAro(partesMedida.larguraPerfil));
              decisao.chaves.push('pedir_aro');
            }
          }
          // Visita: resolve o dia (data/visita.ts) e preenche {DIA}. Dia que nao se resolve vira o texto "sem dia".
          let visita: { iso: string; rotulo: string; diasAte: number } | null = null;
          if (decisao.chaves.includes('visita_confirmada')) {
            visita = resolverDiaVisita(intencoes.find((i: any) => i.intencao === 'VAI_VIR_NA_LOJA')?.diaVisita);
            const semDia = textoFluxo(textosFluxo, 'visita_sem_dia');
            const comDia = textoFluxo(textosFluxo, 'visita_confirmada');
            const ini = decisao.partes.findIndex((p: string) => p === comDia[0]);
            if (ini >= 0) decisao.partes.splice(ini, comDia.length, ...(visita ? comDia.map((p) => p.replace(/\{DIA\}/g, (visita as any).rotulo)) : semDia));
          }
          assuntosLidos = decisao.assuntos;
          // Resposta de agradecimento (ou silencio de agradecimento) so vale se a mensagem for MESMO so agradecimento: com
          // pergunta, dia/hora ou aviso de visita ("combinado, amanha 10h eu passo ai") a IA livre e quem responde
          // (e quem cria o agendamento) — nunca calar nem mandar "Tranquilo!" por cima (revisao 21/09).
          // Pelas chaves, nao pelo tipo: o silencio do FORNECEDOR tambem e 'SILENCIO' e nao pode ser desfeito
          // so porque a oferta dele tem numero (lista de preco).
          const soAgradecimento = (decisao.acaoPrincipal === 'SILENCIO' || decisao.acaoPrincipal === 'RESPONDER_AGRADECIMENTO')
            && decisao.chaves.includes('agradecimento') && !decisao.chaves.includes('fornecedor');
          const naoEhSoAgradecer = soAgradecimento && rajada.some((t) => /\?|amanh|hoje|s[aá]bado|domingo|segunda|ter[cç]a|quarta|quinta|sexta|passo a[ií]|vou a[ií]|\d/i.test(t));
          // Foto + "quanto custa?"/"boa tarde": pedir a medida ou so cumprimentar ignoraria a foto (ver temFoto).
          // Pelas chaves: "é remold? quanto custa?" com foto tem acaoPrincipal RESPONDER_REMOLD mas tambem pede a medida.
          // 13/11 (Josy: "pneus 13 e foi mensagem de 15"): foto + "qual valor / 04 pneus" sem medida escrita — o preco sairia da
          // medida GUARDADA de outra conversa; a foto (do pneu do cliente) manda. Vai pra leitura da foto.
          const cotariaMedidaVelha = temFoto && decisao.chaves.includes('preco_medida') && !rajada.some((t) => /\b\d{3}\s*[\/\-. x]\s*\d{2}\b/i.test(t));
          const ignorariaAFoto = cotariaMedidaVelha || (temFoto && decisao.chaves.some((c) => c.startsWith('pedir_medida') || c === 'saudacao' || c === 'saudacao_retorno'));
          // MONOLOGO (28/10, Ubiratan 07:22): duas rodadas se atropelaram; a 2a leu a conversa ja terminando com a loja e
          // respondeu de novo o "Aí sim" antigo ("Tranquilo! Qualquer dúvida..." logo depois de "Quer que eu separe?").
          // Sem mensagem nova do cliente, gesto (agradecimento/cumprimento/pedir medida/visita) nao sai: silencio.
          if (rabo.length === 0 && decisao.acaoPrincipal !== 'NADA' && decisao.chaves.length && decisao.chaves.every((c) => CHAVES_GESTO.includes(c))) {
            console.log(`[BotService] sem mensagem nova do cliente e a resposta seria so gesto (${decisao.chaves.join(',')}) — silencio.`);
            return res.json({ partes: [], deterministico: true, acaoTipo: 'SILENCIO', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: decisao.assuntos, chaves: ['sem_mensagem_nova'], rajada, simulado: !!req.body?.simular });
          }
          // ORCAMENTO COM UMA MEDIDA QUE A LOJA TEM E OUTRA QUE NAO TEM (27/10, Valter Farias: "4 pneus 185/65/14" + "2 pneus
          // 225/65/18"): o whatsapp-crm troca a resposta inteira pelo "so um instante" (etiqueta + atendente) e o preco da medida
          // que a loja TEM se perdia. Aqui sai, a parte, o preco das medidas da tabela pra ele mandar ANTES do "so um instante".
          let partesAntesDoInstante: string[] | undefined;
          if (decisao.chaves.some((c) => c === 'medida_inexistente' || c === 'sem_alternativa') && decisao.chaves.includes('preco_medida')) {
            const temNaTabela = (i: any) => !(i.intencao === 'DAR_MEDIDA' || i.intencao === 'ESCOLHER_ALTERNATIVA') || (!!(i.medidaExtraida || i.escolhaAlternativa) && encontrarPrecosExatosPorMedida(String(i.medidaExtraida || i.escolhaAlternativa)).length > 0);
            const soDaTabela = (intencoesUsadas.length ? intencoesUsadas : intencoes).filter(temNaTabela);
            const parcial = decidirSequenciaPreco(soDaTabela, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });
            if (parcial.chaves.includes('preco_medida') && !parcial.chaves.some((c) => c === 'medida_inexistente' || c === 'sem_alternativa')) {
              partesAntesDoInstante = parcial.partes.filter((p: string) => !/^\[ENVIAR_[A-Z_]+/i.test(p.trim()));
              console.log(`[BotService] orcamento misto: preco das medidas da tabela vai antes do "so um instante" (${partesAntesDoInstante.length} bolhas).`);
            }
          }
          if (decisao.acaoPrincipal !== 'NADA' && !naoEhSoAgradecer && !ignorariaAFoto) {
            // Audios do dono ([ENVIAR_AUDIO:...]): so vao se quem chamou diz que sabe enviar (audioFluxo). Senao
            // sai so o texto — o marcador nunca pode chegar ao cliente como mensagem.
            const partesDoFluxo = req.body?.audioFluxo === true
              ? decisao.partes
              : decisao.partes.filter((p: string) => !/^\[ENVIAR_AUDIO:[^\]]+\]$/i.test(p.trim()));
            // 05/11 (dono: "robo tem que responder o que a pessoa perguntar"): "voce consegue fazer por mil reais os quatro"
            // recebia so o desconto do dinheiro, sem dizer se aceitava o valor. Contraproposta ganha a resposta direta antes.
            const contraproposta = /\b(faz|fazer|faria|consegue|deixa|deixar|sai|fecha|fechar|vende|vender|pode ser)\b[^?]{0,30}\bpor\s*(r\$\s*)?(\d[\d.,]*|mil|um mil)\b/i.test(rajada.join(" "));
            if (contraproposta && partesDoFluxo.some((p: string) => /desconto|R\$/i.test(p)) && !partesDoFluxo.some((p: string) => /n[aã]o consigo/i.test(p))) {
              partesDoFluxo.unshift("Nesse valor eu não consigo, mas o melhor preço que eu faço pra você é este 👇");
            }
            // 30/10 (dono: "nao convence o cliente a comprar"): o preco terminava seco, sem proximo passo. Preco puro ganha a
            // pergunta que leva ao fechamento; o corte de repeticao (Josy 28/10) impede de sair duas vezes.
            if (decisao.chaves.length === 1 && decisao.chaves[0] === 'preco_medida') {
              partesDoFluxo.push((decisao.novosDados as any)?.quantidade
                ? 'Quando você consegue passar aqui na loja pra gente fazer a troca?'
                : 'Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉');
            }
            return res.json({
              partes: partesDoFluxo,
              deterministico: true,
              acaoTipo: decisao.acaoPrincipal,
              novoEstadoPreco: decisao.novoEstado,
              novosDadosPreco: JSON.stringify(decisao.novosDados),
              // Rastro do fluxo (painel ao vivo)
              via: 'fluxo',
              assuntos: decisao.assuntos,
              chaves: decisao.chaves,
              // Dia da visita (cliente disse que vem): o whatsapp-crm agenda os lembretes (vespera e no dia).
              visita,
              ...(partesAntesDoInstante ? { partesAntesDoInstante } : {}),
              rajada,
              simulado: !!req.body?.simular,
            });
          }
          motivoLivre = ignorariaAFoto ? 'midia_sem_texto' : decisao.assuntos.includes('PERGUNTA_TECNICA') ? 'pergunta_tecnica' : 'assunto_sem_bloco';
        }
      }
    }

    // 12/11 (dono: "reduz bastante o fluxo de IA livre, a IA ta errando muito"): loja com IA_LIVRE_RESTRITA so deixa a
    // IA livre responder quando 1) a loja pediu a medida/o carro e o cliente respondeu com outra coisa (descobrir a medida
    // pelo carro: "Celta", "Versa 2017") ou 2) veio foto/audio (o codigo nao ve o conteudo). O resto (assunto sem bloco,
    // pergunta tecnica, conversa depois do preco) vai pra atendente: "so um instante" + etiqueta + pausa — chave
    // 'assunto_atendente' nas CHAVES_ATENDENTE da loja, tratada no whatsapp-crm. Despedida/agradecimento: so agradece.
    if (lb && iaLivreRestrita(lb.nome) && !temFoto && motivoLivre !== 'midia_sem_texto' && estadoPrecoAtual !== 'aguardando_medida') {
      const base = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: assuntosLidos, rajada, simulado: !!req.body?.simular };
      if (!rabo.length) return res.json({ ...base, partes: [], acaoTipo: 'SILENCIO', chaves: ['sem_mensagem_nova'] });
      // 13/11 (Josy: "o audio rsrs"): resposta automatica de empresa ("Infinity Visual agradece seu contato. Como posso
      // ajudar?") nao e cliente falando: silencio, sem "so um instante" nem etiqueta.
      // 13/11 (Josy: "mandou mensagem vou ver para voce, e foi so bom dia"): a ultima mensagem e so um cumprimento
      // (a rajada pode trazer fala velha do cliente, de semanas atras) -> cumprimenta e pede a medida, nao vai pra atendente.
      const ultimaLinha = String(rajada[rajada.length - 1] || gatilho).trim();
      if (/^(oi+|ol[aá]|opa|bom dia|boa tarde|boa noite|e a[ií])[\s,!.]*(tudo (bem|bom|certo)|td bem|blz|beleza)?[\s?!.]*$/i.test(ultimaLinha)) {
        const textoRecente = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content || '')).join('\n');
        if (estadoPrecoAtual === 'preco_confirmado') {
          return res.json({ ...base, partes: textoFluxo(textosFluxo, 'saudacao_retorno'), acaoTipo: 'RESPONDER_SAUDACAO', chaves: ['saudacao_retorno'] });
        }
        const jaPediu = chavesJaRespondidas(textosFluxo, textoRecente).includes('pedir_medida');
        return res.json({ ...base, partes: [...textoFluxo(textosFluxo, 'saudacao'), ...(jaPediu ? [] : textoFluxo(textosFluxo, 'pedir_medida'))],
          acaoTipo: 'PEDIR_MEDIDA', novoEstadoPreco: 'aguardando_medida', chaves: jaPediu ? ['saudacao'] : ['saudacao', 'pedir_medida'] });
      }
      if (/agradece (o )?seu contato|obrigad[oa] (pelo|por entrar em) contato|mensagem autom[aá]tica|em breve (retornaremos|responderemos|entraremos)|nosso hor[aá]rio de atendimento/i.test(gatilho)) {
        return res.json({ ...base, partes: [], acaoTipo: 'SILENCIO', chaves: ['resposta_automatica'] });
      }
      if (pareceAgradecimento(gatilho)) {
        const textoRecente = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content || '')).join('\n');
        const jaAgradeceu = chavesJaRespondidas(textosFluxo, textoRecente).includes('agradecimento');
        return res.json({ ...base, partes: jaAgradeceu ? [] : textoFluxo(textosFluxo, 'agradecimento'), acaoTipo: jaAgradeceu ? 'SILENCIO' : 'RESPONDER_AGRADECIMENTO', chaves: ['agradecimento'] });
      }
      // Abertura pedindo pneu sem medida ("quero um orçamento de pneus", "tem pneu pra Onix?") o extrator le como
      // OUTRO_ASSUNTO; nao pode ir pra atendente (lead novo parado 12h). Sem carro citado: pede a medida (texto do fluxo).
      // Com carro citado, ou se a medida ja foi pedida: IA livre descobre a medida pelo carro (mesmo caso do aguardando_medida).
      const pedePneuNaAbertura = estadoPrecoAtual === 'sem_estado' && /\b(pneus?|or[çc]amentos?|aro|medida)\b/i.test(gatilho);
      let liberaIaPeloCarro = false;
      if (pedePneuNaAbertura) {
        const citaCarro = /\b(pra|pro|para|do|da|meu|minha|carro|ve[ií]culo|modelo|ano)\b|\b(19|20)\d{2}\b/i.test(gatilho);
        const textoRecente = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content || '')).join('\n');
        const jaPediuMedida = chavesJaRespondidas(textosFluxo, textoRecente).includes('pedir_medida');
        if (citaCarro || jaPediuMedida) liberaIaPeloCarro = true;
        else {
          const cumprimenta = /^\s*(oi|ol[aá]|opa|bom dia|boa tarde|boa noite|e a[ií])(?![a-z])/i.test(gatilho) && !anteriores.some((m: any) => m?.role === 'assistant');
          const dadosNovos: any = {};
          if ((dadosPrecoAtuais as any)?.quantidade) dadosNovos.quantidade = (dadosPrecoAtuais as any).quantidade;
          return res.json({ ...base, partes: [...(cumprimenta ? textoFluxo(textosFluxo, 'saudacao') : []), ...textoFluxo(textosFluxo, 'pedir_medida')],
            acaoTipo: 'PEDIR_MEDIDA', novoEstadoPreco: 'aguardando_medida', novosDadosPreco: JSON.stringify(dadosNovos), chaves: cumprimenta ? ['saudacao', 'pedir_medida'] : ['pedir_medida'] });
        }
      }
      if (!liberaIaPeloCarro) {
        console.log(`[BotService] IA livre restrita (${lb.nome}): ${motivoLivre} em ${estadoPrecoAtual} — vai pra atendente.`);
        return res.json({ ...base, partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], acaoTipo: 'PASSAR_ATENDENTE', chaves: ['assunto_atendente'] });
      }
      console.log(`[BotService] IA livre restrita (${lb.nome}): pneu pelo carro na abertura — IA livre descobre a medida.`);
    }

    // SIMULACAO (tela Fluxo do painel, "testar uma mensagem"): mostra o caminho SEM chamar a IA livre
    // e sem enviar nada — so o que o fluxo decidiu.
    if (req.body?.simular) {
      return res.json({
        partes: [],
        deterministico: false,
        novoEstadoPreco: estadoPrecoAtual,
        novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
        via: 'ia_livre',
        motivoLivre,
        assuntos: assuntosLidos,
        chaves: [],
        rajada,
        simulado: true,
      });
    }

    const briefingComercial = montarBriefingComercialDeterministico(textosCliente);

    // COERENCIA DE PRECO NA MESMA CONVERSA (achado 02/09, caso real do Elan): a
    // atendente ja tinha passado um preco e o robo, na sequencia, passou OUTRO valor
    // pra mesma coisa. Pro cliente isso parece enganacao e queima a loja. Aqui a gente
    // varre o que JA foi dito nesta conversa (pelo robo, pela atendente ou por
    // qualquer canal) e avisa o robo pra nao se contradizer.
    const jaFalados = valoresEmReais(
      (Array.isArray(messages) ? messages : [])
        .filter((m: any) => m && m.role === 'assistant')
        .map((m: any) => String(m.content || ''))
        .join(' ')
    );
    const avisoData = '\n' + contextoDeData();
    const avisoCoerencia = jaFalados.length
      ? '\nPRECOS_JA_PASSADOS_NESTA_CONVERSA: ' +
        jaFalados.map((v) => 'R$ ' + v.replace('.', ',')).join(', ') +
        '. Esses valores JA foram ditos ao cliente nesta conversa (por voce ou por um atendente). NAO passe valor diferente pra mesma coisa — o cliente vai achar que a loja mudou o preco. Se o valor que voce ia dizer nao bate com o que ja foi dito, MANTENHA o que ja foi passado. Se o cliente perguntar de novo, repita o MESMO valor. So mude se o pedido dele mudou (quantidade, medida ou forma de pagamento diferente) — e nesse caso deixe explicito o que mudou.'
      : '';
    const resposta = await gerarRespostaViaOpenAI({
      lojaBot,
      messages,
      imagem,
      audio,
      lojas: Array.isArray(lojas) ? lojas : [],
      briefingComercial: briefingComercial + avisoData + avisoCoerencia + instrucaoCerebro,
    });


    // TRAVA DE PRECO: a IA escreveu o texto com as proprias palavras. Antes de mandar
    // pro cliente, confere se todo valor em R$ citado existe no briefing (que vem da
    // tabela). Se ela inventou ou errou uma conta, tenta UMA vez avisando do erro;
    // se insistir, responde sem preco em vez de mandar valor errado no WhatsApp.
    let partesFinais = resposta.partes;
    const invalidos = precosForaDaTabela(partesFinais, textosCliente);
    if (invalidos.length) {
      console.error(
        '[BotService][TRAVA DE PRECO] A IA citou valor(es) que nao estao na tabela:',
        invalidos.join(', '),
        '| resposta recusada, tentando de novo.'
      );
      const segunda = await gerarRespostaViaOpenAI({
      lojaBot,
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: na tentativa anterior voce escreveu um valor que NAO existe na tabela (' +
          invalidos.join(', ') +
          '). NUNCA invente nem calcule preco de cabeca. Use SOMENTE os valores exatos que aparecem acima. Se nao houver preco aqui pra situacao, responda SEM citar valor nenhum e peca a medida.',
      });
      const aindaInvalidos = precosForaDaTabela(segunda.partes, textosCliente);
      if (aindaInvalidos.length) {
        console.error(
          '[BotService][TRAVA DE PRECO] Segunda tentativa tambem errou:',
          aindaInvalidos.join(', '),
          '| respondendo sem preco.'
        );
        partesFinais = ['Deixa eu confirmar uma coisa com você — pode repetir, por favor?'];
      } else {
        partesFinais = segunda.partes;
      }
    }


    // TRAVA DE COMPORTAMENTO: erros graves que uma regra em texto no prompt nao
    // consegue garantir 100% (o prompt ja passa de 30 mil caracteres). Confere padroes
    // conhecidos de promessa vazia (ex.: "vou te transferir para o Fulano") — achado
    // real 03/09. Mesma estrategia da trava de preco: tenta de novo avisando do erro;
    // se insistir, cai numa resposta segura.
    if (prometeuTransferenciaFalsa(partesFinais)) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] A IA prometeu uma transferencia que nao pode cumprir — tentando de novo.');
      const segundaTentativa = await gerarRespostaViaOpenAI({
      lojaBot,
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: na tentativa anterior voce prometeu transferir a conversa pra uma pessoa especifica — voce NAO TEM esse mecanismo e essa promessa e vazia. Reconheca o pedido sem prometer transferencia (\'anotado, vou avisar por aqui\') e continue ajudando com o que voce sabe.',
      });
      if (!prometeuTransferenciaFalsa(segundaTentativa.partes)) {
        partesFinais = segundaTentativa.partes;
      } else {
        console.error('[BotService][TRAVA DE COMPORTAMENTO] Segunda tentativa tambem prometeu transferencia — usando resposta segura.');
        partesFinais = ['Anotado — vou avisar aqui pra alguem da loja te dar atenção. Enquanto isso, posso te ajudar com medida, preço ou endereço, se quiser.'];
      }
    }


    // TRAVA DE COMPORTAMENTO 2 (04/09): corta cirurgicamente qualquer repescada de
    // modelo/ano/marca preferida/servico adicional depois do preco — achado em 4
    // conversas reais no mesmo dia mesmo com a regra explicita no prompt.
    partesFinais = removerReperguntaPosPreco(partesFinais);

    // TRAVA DE COMPORTAMENTO 8 (30/10, dono: "pergunta o carro depois do cliente ja ter passado a medida"; Itamar e Lordes):
    // com medida da tabela conhecida, a IA livre nao pergunta carro/uso — o preco sai da tabela.
    {
      const medidaConhecida = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
      const PEDE_CARRO = /(qual|que)\s+(é\s+o\s+|e\s+o\s+)?(seu\s+)?(carro|ve[ií]culo)\b|em qual carro|modelo do (seu )?carro|na cidade, na estrada|mais na cidade/i;
      if (medidaConhecida && partesFinais.some((p: string) => PEDE_CARRO.test(p))) {
        const cotacao = decidirSequenciaPreco([{ intencao: 'DAR_MEDIDA', medidaExtraida: medidaConhecida, quantidadeExtraida: dadosPrecoAtuais.quantidade ?? null, escolhaAlternativa: null } as any], 'preco_confirmado', dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
        console.error(`[BotService][TRAVA DE COMPORTAMENTO] IA livre perguntou o carro com a medida ${medidaConhecida} ja conhecida — cotando pela tabela.`);
        if (cotacao.partes.length) partesFinais = cotacao.partes;
      }
    }

    // TRAVA DE COMPORTAMENTO 5 (19/09): o robo nao envia foto e nunca pode dizer que vai enviar
    // ("segue foto do pneu" sem mandar nada). Corta a promessa; se sobrar nada, chama pra ver o
    // pneu na loja (texto da categoria "foto", editavel na tela Fluxo).
    const semPromessaDeFoto = removerPromessaDeFoto(partesFinais);
    if (semPromessaDeFoto.join('\n') !== partesFinais.join('\n')) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] A IA prometeu enviar foto — promessa cortada.');
      partesFinais = semPromessaDeFoto.length ? semPromessaDeFoto : textoFluxo(textosFluxo, 'foto');
    }

    // TRAVAS DE COMPORTAMENTO 6 e 7 (21/09, conversas reais de hoje). 6: nao cita o horario da loja quando o cliente so
    // agradeceu/disse ok (a IA soltava "Nosso horario: ..." depois de todo "ok obrigado"). 7: o pino da localizacao
    // ja foi mandado — tira "Segue nossa localizacao!" solto (o sistema ja barra o pino, sobrava so a frase).
    // Audio/foto sem texto: o codigo nao sabe o que o cliente disse — a trava 6 nao mexe.
    const clienteEscreveu = !temMidiaSemTexto && !audio?.base64;
    const antesDasTravas67 = partesFinais.join('\n');
    if (minutosDesdeLocalizacao !== null) partesFinais = removerLocalizacaoRepetida(partesFinais);
    if (clienteEscreveu) partesFinais = removerHorarioNaoPedido(partesFinais, gatilho);
    if (partesFinais.join('\n') !== antesDasTravas67) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] Cortado horario nao pedido e/ou anuncio de pino repetido na resposta da IA livre.');
      if (!partesFinais.length) {
        // A resposta era so isso. Se o cliente so agradeceu: silencio. Se ele pediu/perguntou algo (ex.: mandou audio
        // pedindo a localizacao de novo), nunca fica sem resposta: o texto fixo "localizacao_repetida" (revisao 21/09).
        const respostaSegura = clienteEscreveu && pareceAgradecimento(gatilho) ? [] : textoFluxo(textosFluxo, 'localizacao_repetida');
        return res.json({
          partes: respostaSegura,
          deterministico: false,
          novoEstadoPreco: estadoPrecoAtual,
          novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
          via: 'ia_livre',
          motivoLivre: respostaSegura.length ? motivoLivre : 'cortada_pelas_travas',
          assuntos: assuntosLidos,
          chaves: [],
          rajada,
        });
      }
    }

    // TRAVA DE COMPORTAMENTO 3 (09/09): nao repetir o que ja foi dito nesta conversa.
    // Se sobrar nada, tenta de novo avisando; se ainda assim repetir, manda o que veio
    // (ficar em silencio com o cliente esperando seria pior).
    const jaDitas = (Array.isArray(messages) ? messages : [])
      .filter((m: any) => m && m.role === 'assistant')
      .map((m: any) => String(m.content || ''));
    const semRepeticao = removerRepeticaoRecente(partesFinais, jaDitas);
    if (semRepeticao.length) {
      partesFinais = semRepeticao;
    } else {
      console.error('[BotService][TRAVA DE REPETICAO] A resposta era so repeticao do que ja foi dito — tentando de novo.');
      const outra = await gerarRespostaViaOpenAI({
      lojaBot,
        messages,
        imagem,
        audio,
        lojas: Array.isArray(lojas) ? lojas : [],
        briefingComercial:
          briefingComercial +
          '\nATENCAO: voce JA disse exatamente isso nesta conversa. Nao repita frase, pergunta nem lista que ja mandou. Avance: se ja tem a medida e o preco, chame pro fechamento (quando ele pode vir na loja). Se falta um dado essencial, faca UMA pergunta curta e diferente das anteriores.',
      });
      // A segunda tentativa TAMBEM passa por todas as travas (preco, transferencia, repergunta, foto, pino, horario):
      // antes ia direto pro cliente sem nenhuma (revisao 21/09). Se as travas a zerarem, fica em silencio: o cliente ja
      // tinha recebido exatamente a resposta que a 1a tentativa repetiu.
      let outraSegura = outra.partes;
      if (prometeuTransferenciaFalsa(outraSegura) || precosForaDaTabela(outraSegura, textosCliente).length) outraSegura = [];
      outraSegura = removerPromessaDeFoto(removerReperguntaPosPreco(outraSegura));
      if (minutosDesdeLocalizacao !== null) outraSegura = removerLocalizacaoRepetida(outraSegura);
      if (clienteEscreveu) outraSegura = removerHorarioNaoPedido(outraSegura, gatilho);
      const limpa = removerRepeticaoRecente(outraSegura, jaDitas);
      partesFinais = limpa.length ? limpa : outraSegura;
      if (!partesFinais.length) {
        console.error('[BotService][TRAVA DE REPETICAO] A segunda tentativa tambem foi cortada pelas travas — silencio (o cliente ja tinha essa resposta).');
        return res.json({
          partes: [],
          deterministico: false,
          novoEstadoPreco: estadoPrecoAtual,
          novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
          via: 'ia_livre',
          motivoLivre: 'cortada_pelas_travas',
          assuntos: assuntosLidos,
          chaves: [],
          rajada,
        });
      }
    }

    // TRAVA POS-ORCAMENTO (23/10, caso Marcelo Santos): tira, frase por frase, o "parcelar em ate 10x" que a loja ja disse
    // nas ultimas mensagens e a justificativa de orcamento anterior ("O 175/65/14 que te passei antes e..."). Nunca zera a
    // resposta: se nao sobrar nada, fica a 1a bolha original (data/travaPosOrcamento.ts).
    {
      const posOrcamento = removerParcelamentoRepetidoEJustificativa(partesFinais, anteriores, rajada);
      if (posOrcamento.cortadas.length) {
        console.error(`[BotService][TRAVA POS-ORCAMENTO] cortado: ${JSON.stringify(posOrcamento.cortadas)}`);
        partesFinais = posOrcamento.partes;
      }
    }

    res.json({
      partes: partesFinais,
      deterministico: false,
      novoEstadoPreco: estadoPrecoAtual,
      novosDadosPreco: JSON.stringify(dadosPrecoAtuais),
      via: 'ia_livre',
      motivoLivre,
      assuntos: assuntosLidos,
      chaves: [],
      rajada,
    });
  } catch (e: any) {
    console.error('[BotService] Erro em /gerar-resposta:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Erro interno no bot-service.' });
  }
});

const PORT = Number(process.env.BOT_SERVICE_PORT || 3010);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[BotService] rodando isolado na porta ${PORT} (nao afeta conexoes de WhatsApp)`);
});
