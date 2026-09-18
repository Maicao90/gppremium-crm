import fs from 'fs';
import path from 'path';
import { prisma } from '../server';

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
type EnviarLocalizacao = (lat: number, lng: number, nome: string, endereco: string) => Promise<boolean>;

interface VideoBotIA {
  tipo: 'video';
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
}

interface RespostaBotService {
  partes: string[];
  deterministico: boolean;
  novoEstadoPreco?: string;
  novosDadosPreco?: string;
}

const timers = new Map<string, NodeJS.Timeout>();
const versoes = new Map<string, number>();

const chave = (usuarioId: string, chatJid: string) => `${usuarioId}:${chatJid}`;

function tempoDigitacao(texto: string): number {
  const variacao = Math.floor(Math.random() * 900);
  return Math.min(6000, Math.max(1200, 700 + texto.length * 28 + variacao));
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

function limparTagsEspeciais(texto: string): string {
  return texto
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
}): Promise<RespostaBotService> {
  const resposta = await fetch(`${BOT_SERVICE_URL}/gerar-resposta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(`bot-service ${resposta.status}: ${body?.error || 'resposta invalida'}`);
  }
  return {
    partes: Array.isArray(body?.partes) ? body.partes.map(String) : [],
    deterministico: !!body?.deterministico,
    novoEstadoPreco: typeof body?.novoEstadoPreco === 'string' ? body.novoEstadoPreco : undefined,
    novosDadosPreco: typeof body?.novosDadosPreco === 'string' ? body.novosDadosPreco : undefined,
  };
}

async function conversaContinuaAtual(usuarioId: string, chatJid: string, waId: string): Promise<boolean> {
  const [ultimaEntrada, estado] = await Promise.all([
    prisma.mensagem.findFirst({
      where: { usuarioId, chatJid, fromMe: false },
      orderBy: { timestamp: 'desc' },
      select: { waId: true },
    }),
    prisma.botConversa.findUnique({ where: { usuarioId_chatJid: { usuarioId, chatJid } } }),
  ]);
  if (!ultimaEntrada || ultimaEntrada.waId !== waId) return false;
  return !estado?.pausadoAte || estado.pausadoAte.getTime() <= Date.now();
}

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
async function naoAtender(usuarioId: string, chatJid: string): Promise<boolean> {
  try {
    if (!fs.existsSync(CAMINHO_NAO_ATENDER)) return false;
    const cfg = JSON.parse(fs.readFileSync(CAMINHO_NAO_ATENDER, 'utf8'));
    const numeros: string[] = Array.isArray(cfg?.numeros) ? cfg.numeros : [];
    const nomes: string[] = Array.isArray(cfg?.nomes) ? cfg.nomes : [];

    // Achado 18/09: chatJid pode ser um @lid (id interno do WhatsApp, sem relacao
    // numerica com o numero real) — comparar so o chatJid nunca batia com numero
    // digitado na lista pra contatos assim. Busca tambem o numeroReal (ja resolvido
    // e salvo nas mensagens desse chat) e confere os dois.
    const alvo = String(chatJid || '').replace(/[^0-9]/g, '');
    let numeroRealAlvo = '';
    if (chatJid.includes('@lid')) {
      const msgComNumero = await prisma.mensagem.findFirst({
        where: { usuarioId, chatJid, numeroReal: { not: null } },
        orderBy: { timestamp: 'desc' },
        select: { numeroReal: true },
      });
      numeroRealAlvo = String(msgComNumero?.numeroReal || '').replace(/[^0-9]/g, '');
    }
    if (numeros.some((n) => { const limpo = String(n).replace(/[^0-9]/g, ''); return limpo.length >= 6 && ((alvo && alvo.includes(limpo)) || (numeroRealAlvo && numeroRealAlvo.includes(limpo))); })) {
      return true;
    }

    if (nomes.length) {
      const ultima = await prisma.mensagem.findFirst({
        where: { usuarioId, chatJid, chatNome: { not: '' } },
        orderBy: { timestamp: 'desc' },
        select: { chatNome: true },
      });
      const nomeAtual = String(ultima?.chatNome || '').toLowerCase();
      if (nomeAtual && nomes.some((padrao) => nomeAtual.includes(String(padrao).toLowerCase()))) {
        return true;
      }
    }

    return false;
  } catch (e) {
    return false; // lista quebrada nao pode derrubar o atendimento
  }
}

const LIMITE_RESPOSTAS_JANELA = 8;
const JANELA_ANTI_LOOP_MS = 5 * 60 * 1000;

async function ritmoDeLoop(usuarioId: string, chatJid: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_ANTI_LOOP_MS);
  const nossas = await prisma.mensagem.count({
    where: { usuarioId, chatJid, fromMe: true, enviadoPorId: 'bot', timestamp: { gte: desde } },
  });
  return nossas >= LIMITE_RESPOSTAS_JANELA;
}

async function executar(params: AgendarBotParams, versao: number) {
  const key = chave(params.usuarioId, params.chatJid);
  if (versoes.get(key) !== versao) return;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: params.usuarioId },
      select: { botIaAtivo: true, nome: true, lojaId: true },
    });
    if (!usuario?.botIaAtivo || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;

    // Se a gente ja respondeu demais nessa conversa em pouco tempo, e loop: pausa e
    // deixa um humano olhar, em vez de continuar alimentando a troca automatica.
    // Fornecedor/parceiro/sistema: registra no painel, mas nao responde.
    if (await naoAtender(params.usuarioId, params.chatJid)) {
      console.log(`[Bot IA] ${params.chatJid} esta na lista de nao-atender — deixando pros humanos.`);
      return;
    }

    if (await ritmoDeLoop(params.usuarioId, params.chatJid)) {
      console.error(`[Bot IA][Anti-loop] ${params.chatJid}: ${LIMITE_RESPOSTAS_JANELA}+ respostas em 5 min — parece conversa com outro robo. Pausando 12h.`);
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, pausadoAte: new Date(Date.now() + 12 * 60 * 60 * 1000), motivoPausa: 'anti_loop' },
        update: { pausadoAte: new Date(Date.now() + 12 * 60 * 60 * 1000), motivoPausa: 'anti_loop' },
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
    // Mensagens do Assistente de IA da Meta (enviadoPorId = meta_ai) NAO sao do nosso robo.
    // Se entrassem no historico como "assistant", o robo herdaria "Pneu Express" e
    // "conectei voce com a nossa equipe" como se tivesse dito isso (achado 08/09).
    for (let i = historico.length - 1; i >= 0; i--) { if ((historico[i] as any).enviadoPorId === 'meta_ai') historico.splice(i, 1); }
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = historico.map((m: any) => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: String(m.texto || (m.tipo === 'imagem' ? '[imagem enviada]' : m.tipo === 'audio' ? '[audio enviado]' : `[${m.tipo}]`)),
    }));
    const ultima = [...historico].reverse().find((m: any) => !m.fromMe);
    const ultimosTextosCliente = historico
      .filter((m: any) => !m.fromMe)
      // Achado 27/08: 4 mensagens era pouco pra negociacao longa (medida/quantidade
      // confirmadas 6+ mensagens atras "somem" da janela, e o preco cai pra IA calcular
      // de cabeca em vez de usar a tabela — risco real de errar conta de dinheiro).
      .slice(-15)
      .map((m: any) => String(m.texto || ''))
      .filter(Boolean)
      .join('\n');
    const midia = midiaDaUltima(ultima);

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

    const resposta = await gerarRespostaViaBotService({
      messages,
      ...midia,
      lojas,
      ultimosTextosCliente,
      estadoPreco: estadoPrecoSalvo?.estadoPreco || 'sem_estado',
      dadosPreco: estadoPrecoSalvo?.dadosPreco || '{}',
    });

    if (resposta.deterministico && resposta.partes.length) {
      // Cada parte vai como mensagem SEPARADA (achado 25/08: preco tem que ser gradual,
      // nunca a vista + parcelamento + desconto colados numa unica mensagem).
      for (const parte of resposta.partes) {
        const textoLimpo = parte.trim();
        if (!textoLimpo) continue;
        const enviada = await params.enviarParte(textoLimpo.slice(0, 3500), tempoDigitacao(textoLimpo));
        if (!enviada) return;
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
      return;
    }

    const partes = resposta.partes.slice(0, 4);
    const transferir = partes.some((p: string) => p.includes('[TRANSFERIR_HUMANO]'));


    // Processa agendamento se presente
    for (const p of partes) {
      // Remarketing: o robo agenda o proprio retorno quando o cliente adia.
      if (p.includes('[LEMBRAR')) {
        await processarRemarketing(params.usuarioId, params.chatJid, p).catch(() => {});
      }
      if (p.includes('[AGENDAR_VISITA')) {
        await processarAgendamentoAutomatico(params.usuarioId, params.chatJid, p);
      }
      if (p.includes('[ENVIAR_LOCALIZACAO]')) {
        const loc = lerLocalizacaoLoja();
        if (loc) {
          await params.enviarLocalizacao(loc.lat, loc.lng, loc.nome, loc.endereco).catch(() => {});
        } else {
          console.error('[Bot IA] [ENVIAR_LOCALIZACAO] pedido mas LOCALIZACAO_LAT/LNG nao configurados.');
        }
      }
    }

    const haConteudoUtil = partes.some((p: string) => limparTagsEspeciais(p) || extrairVideosDoTexto(p).length > 0);
    if (!haConteudoUtil) return;

    for (const parte of partes) {
      if (versoes.get(key) !== versao || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;
      const videos = extrairVideosDoTexto(parte);
      const textoLimpo = limparTagsEspeciais(parte).slice(0, 3500);

      if (!videos.length) {
        if (!textoLimpo) continue;
        const enviada = await params.enviarParte(textoLimpo, tempoDigitacao(textoLimpo));
        if (!enviada) return;
        continue;
      }

      const primeiroVideo = videos[0];
      const usarTextoComoLegenda = videos.length === 1 && !!textoLimpo && !!primeiroVideo && !primeiroVideo.legenda;
      if (textoLimpo && !usarTextoComoLegenda) {
        const enviada = await params.enviarParte(textoLimpo, tempoDigitacao(textoLimpo));
        if (!enviada) return;
      }

      for (let i = 0; i < videos.length; i++) {
        if (versoes.get(key) !== versao || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;
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
        ...(transferir ? { pausadoAte: new Date(Date.now() + 120 * 60 * 1000), motivoPausa: 'transferencia_humana' } : {}),
        ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
        ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
      },
      update: {
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(transferir ? { pausadoAte: new Date(Date.now() + 120 * 60 * 1000), motivoPausa: 'transferencia_humana' } : {}),
        ...(resposta.novoEstadoPreco ? { estadoPreco: resposta.novoEstadoPreco } : {}),
        ...(resposta.novosDadosPreco ? { dadosPreco: resposta.novosDadosPreco } : {}),
      },
    });
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
  const atual = (versoes.get(key) || 0) + 1;
  versoes.set(key, atual);
  const anterior = timers.get(key);
  if (anterior) clearTimeout(anterior);

  await prisma.botConversa.upsert({
    where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
    create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId },
    update: { ultimoInboundWaId: params.waId },
  });

  // Agrupa a rajada natural do cliente antes de consultar a IA.
  const espera = 5500 + Math.floor(Math.random() * 3000);
  const timer = setTimeout(() => {
    timers.delete(key);
    executar(params, atual).catch((e) => console.error('[Bot IA] executar:', e));
  }, espera);
  timer.unref?.();
  timers.set(key, timer);
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
  await prisma.botConversa.upsert({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    create: { usuarioId, chatJid, pausadoAte: new Date(Date.now() + duracao * 60 * 1000), motivoPausa: motivo },
    update: { pausadoAte: new Date(Date.now() + duracao * 60 * 1000), motivoPausa: motivo },
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
