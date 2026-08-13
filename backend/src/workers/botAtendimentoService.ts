import fs from 'fs';
import path from 'path';
import { prisma } from '../server';

type EnviarParte = (texto: string, tempoDigitacaoMs: number) => Promise<boolean>;

interface AgendarBotParams {
  usuarioId: string;
  chatJid: string;
  waId: string;
  enviarParte: EnviarParte;
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

async function executar(params: AgendarBotParams, versao: number) {
  const key = chave(params.usuarioId, params.chatJid);
  if (versoes.get(key) !== versao) return;

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: params.usuarioId },
      select: { botIaAtivo: true },
    });
    if (!usuario?.botIaAtivo || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;

    const historico = await prisma.mensagem.findMany({
      where: { usuarioId: params.usuarioId, chatJid: params.chatJid },
      orderBy: { timestamp: 'desc' },
      take: 40,
    });
    historico.reverse();
    const messages = historico.map((m: any) => ({
      role: m.fromMe ? 'assistant' : 'user',
      content: String(m.texto || (m.tipo === 'imagem' ? '[imagem enviada]' : m.tipo === 'audio' ? '[audio enviado]' : `[${m.tipo}]`)),
    }));
    const ultima = [...historico].reverse().find((m: any) => !m.fromMe);
    const midia = midiaDaUltima(ultima);

    const base = process.env.PNEUS_BOT_URL || 'https://pneus-bot.vercel.app';
    const token = process.env.PNEUS_BOT_TOKEN || '';
    const fetchGlobal: any = (globalThis as any).fetch;
    if (!token || !fetchGlobal) {
      console.error('[Bot IA] PNEUS_BOT_URL/TOKEN ou fetch nao configurado.');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    let resposta: any;
    try {
      const r = await fetchGlobal(`${base}/api/bridge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, ...midia }),
        signal: controller.signal,
      });
      resposta = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`bridge ${r.status}: ${resposta?.error || 'resposta invalida'}`);
    } finally {
      clearTimeout(timeout);
    }

    let partes = Array.isArray(resposta?.partes) ? resposta.partes.map(String).slice(0, 4) : [];
    const transferir = partes.some((p: string) => p.includes('[TRANSFERIR_HUMANO]'));
    partes = partes
      .map((p: string) => p.replace(/\[TRANSFERIR_HUMANO\]/g, '').trim())
      .filter(Boolean);
    if (!partes.length) return;

    for (const parte of partes) {
      if (versoes.get(key) !== versao || !(await conversaContinuaAtual(params.usuarioId, params.chatJid, params.waId))) return;
      const enviada = await params.enviarParte(parte.slice(0, 3500), tempoDigitacao(parte));
      if (!enviada) return;
    }

    await prisma.botConversa.upsert({
      where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
      create: {
        usuarioId: params.usuarioId,
        chatJid: params.chatJid,
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(transferir ? { pausadoAte: new Date(Date.now() + 24 * 60 * 60 * 1000), motivoPausa: 'transferencia_humana' } : {}),
      },
      update: {
        ultimoInboundWaId: params.waId,
        ultimaRespostaEm: new Date(),
        ...(transferir ? { pausadoAte: new Date(Date.now() + 24 * 60 * 60 * 1000), motivoPausa: 'transferencia_humana' } : {}),
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
