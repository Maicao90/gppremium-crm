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
import { rotasCerebro, licoesAtivasDaLoja, casarLicao, partesDaLicao, registrarUso } from './cerebro';
import { sanitizarTextosFluxo, chavesJaRespondidas, textoFluxo, SILENCIO_SE_REPETIR } from '../data/fluxoCatalogo';
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
    // 23/10 (retomada de clientes): "sim" / "quero" / "preciso" respondendo a mensagem de RETOMADA da loja
    // ("...os pneus 185/65/15. Ainda está precisando?") vale como se o cliente tivesse mandado essa medida -> preco
    // pela tabela. Sem isso a IA livre respondia "pode repetir, por favor?". Sem medida na retomada, segue normal.
    {
      const ultimaDaLoja = String([...anteriores].reverse().find((m: any) => m?.role === 'assistant')?.content || '');
      const AFIRMATIVO = /^(sim|s|ss|sim sim|quero|quero sim|sim quero|preciso|preciso sim|sim preciso|ainda preciso|ainda estou precisando|t[oô] precisando|estou precisando|t[oô] sim|pode ser|pode|pode sim|manda|pode mandar|me passa|passa|claro|claro que sim|isso|opa|uhum|aham|yes|ok|blz|beleza|bora|tenho interesse|tenho sim)[\s!.,😊👍🙏]*$/i;
      if (/Ainda está precisando\?/i.test(ultimaDaLoja) && rajada.length && rajada.every((t: string) => AFIRMATIVO.test(String(t).trim()))) {
        const medidaRetomada = extrairMedidasDoTexto(ultimaDaLoja)[0];
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
      if (soAro && !medidaJuntada && !dadosPrecoAtuais.medida && !medidaDoHistorico(anteriores)) {
        return res.json({
          partes: [`Show, aro ${soAro[2]}! 👍`, 'Qual é o carro? Já te passo a medida certa e o valor.'],
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
    if (!temMidiaSemTexto && gatilho.trim()) {
      const licoes = licoesAtivasDaLoja(lojaBot?.nome);
      if (licoes.length) {
        const ctx = anteriores.slice(-6).map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'LOJA'}: ${semExemplos(String(m.content || '')).slice(0, 300)}`).join('\n');
        const l = await casarLicao(rajada.length ? rajada : [gatilho], ctx, licoes);
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
    if (!temMidiaSemTexto && gatilho.trim() && !instrucaoCerebro) {
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
          const ignorariaAFoto = temFoto && decisao.chaves.some((c) => c.startsWith('pedir_medida') || c === 'saudacao' || c === 'saudacao_retorno');
          if (decisao.acaoPrincipal !== 'NADA' && !naoEhSoAgradecer && !ignorariaAFoto) {
            // Audios do dono ([ENVIAR_AUDIO:...]): so vao se quem chamou diz que sabe enviar (audioFluxo). Senao
            // sai so o texto — o marcador nunca pode chegar ao cliente como mensagem.
            const partesDoFluxo = req.body?.audioFluxo === true
              ? decisao.partes
              : decisao.partes.filter((p: string) => !/^\[ENVIAR_AUDIO:[^\]]+\]$/i.test(p.trim()));
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
              rajada,
              simulado: !!req.body?.simular,
            });
          }
          motivoLivre = ignorariaAFoto ? 'midia_sem_texto' : decisao.assuntos.includes('PERGUNTA_TECNICA') ? 'pergunta_tecnica' : 'assunto_sem_bloco';
        }
      }
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
