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

type EnviarParte = (texto: string, tempoDigitacaoMs: number) => Promise<boolean>;
type EnviarVideo = (video: VideoBotIA, tempoDigitacaoMs: number) => Promise<boolean>;

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
}

interface RespostaBotService {
  partes: string[];
  deterministico: boolean;
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
    .replace(/\[(?:ENVIAR_VIDEO|VIDEO):[^\]]+\]/gi, '')
    .trim();
}

async function gerarRespostaViaBotService(args: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  imagem?: any;
  audio?: any;
  lojas: Array<{ nome: string | null; cidade: string | null; estado: string | null; whatsapp: string | null; telefone_fixo: string | null }>;
  ultimosTextosCliente: string;
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

async function executar(params: AgendarBotParams, versao: number) {
  const key = chave(params.usuarioId, params.chatJid);
  if (versoes.get(key) !== versao) return;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: params.usuarioId },
      select: { botIaAtivo: true, nome: true, lojaId: true },
    });
    if (!usuario?.botIaAtivo || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;

    const historico = await prisma.mensagem.findMany({
      where: { usuarioId: params.usuarioId, chatJid: params.chatJid },
      orderBy: { timestamp: 'desc' },
      take: 40,
    });
    historico.reverse();
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = historico.map((m: any) => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: String(m.texto || (m.tipo === 'imagem' ? '[imagem enviada]' : m.tipo === 'audio' ? '[audio enviado]' : `[${m.tipo}]`)),
    }));
    const ultima = [...historico].reverse().find((m: any) => !m.fromMe);
    const ultimosTextosCliente = historico
      .filter((m: any) => !m.fromMe)
      .slice(-4)
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
        },
        update: {
          ultimoInboundWaId: params.waId,
          ultimaRespostaEm: new Date(),
        },
      });
      return;
    }

    const partes = resposta.partes.slice(0, 4);
    const transferir = partes.some((p: string) => p.includes('[TRANSFERIR_HUMANO]'));

    // Processa agendamento se presente
    for (const p of partes) {
      if (p.includes('[AGENDAR_VISITA')) {
        await processarAgendamentoAutomatico(params.usuarioId, params.chatJid, p);
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
      },
      update: {
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(transferir ? { pausadoAte: new Date(Date.now() + 120 * 60 * 1000), motivoPausa: 'transferencia_humana' } : {}),
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
