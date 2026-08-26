import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { prisma } from '../server';
import { enviarMensagemInbox, enviarMidiaInbox, resolverConexaoEfetiva } from '../workers/whatsappService';
import { lerBotPneusConfig, salvarBotPneusConfig } from '../services/botPneusConfig';

const router = Router();

type ReqUser = {
  sub?: string;
  role?: string;
  modulos?: string[];
};

function ehMaster(role?: string): boolean {
  return ['master', 'admin'].includes(String(role || '').toLowerCase());
}

function normalizarNumero(valor: string): string {
  return String(valor || '').replace(/\D/g, '');
}

function extrairNumeroDoJid(chatJid: string, numeroReal?: string | null): string {
  const real = normalizarNumero(numeroReal || '');
  if (real) return real;
  return normalizarNumero(String(chatJid || '').split('@')[0] || '');
}

function extrairMedida(texto: string): string {
  const match = String(texto || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .match(/\b(\d{3}\/\d{2}(?:R|\/)?\d{2})\b/);
  if (!match?.[1]) return '';
  return match[1].replace('R', '/');
}


async function usuarioIdsPermitidos(req: any): Promise<string[]> {
  const user = (req.user || {}) as ReqUser;
  if (!user.sub) return [];
  if (ehMaster(user.role)) {
    const todos = await prisma.usuario.findMany({
      where: { ativo: true, botIaAtivo: true },
      select: { id: true },
    });
    return todos.map((u) => u.id);
  }
  const eu = await prisma.usuario.findUnique({
    where: { id: String(user.sub) },
    select: { id: true, botIaAtivo: true, whatsappDonoId: true },
  });
  if (!eu) return [];
  const ids = [eu.id];
  if (eu.whatsappDonoId) ids.push(eu.whatsappDonoId);
  return ids;
}

async function usuariosBotIds(): Promise<Set<string>> {
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, botIaAtivo: true },
    select: { id: true, whatsappDonoId: true },
  });
  const ids = new Set<string>();
  for (const u of usuarios) {
    ids.add(u.id);
    if (u.whatsappDonoId) ids.add(u.whatsappDonoId);
  }
  return ids;
}

async function validarContato(req: any, contatoId: string) {
  const [permitidos, botIds] = await Promise.all([usuarioIdsPermitidos(req), usuariosBotIds()]);
  const [usuarioId, ...jidRest] = String(contatoId || '').split('::');
  const chatJid = jidRest.join('::');
  if (!usuarioId || !chatJid) return null;
  if (!permitidos.includes(usuarioId)) return null;
  if (!botIds.has(usuarioId)) return null;
  return { usuarioId, chatJid };
}

async function contatoAtual(usuarioId: string, chatJid: string) {
  const [estado, ultimaComNumero, msgs] = await Promise.all([
    prisma.botConversa.findUnique({ where: { usuarioId_chatJid: { usuarioId, chatJid } } }),
    prisma.mensagem.findFirst({
      where: { usuarioId, chatJid },
      orderBy: { timestamp: 'desc' },
      select: { chatNome: true, numeroReal: true, texto: true, fromMe: true, timestamp: true, tipo: true },
    }),
    prisma.mensagem.findMany({
      where: { usuarioId, chatJid },
      orderBy: { timestamp: 'desc' },
      take: 30,
      select: { texto: true, fromMe: true, numeroReal: true, chatNome: true, timestamp: true },
    }),
  ]);

  const historico = [...msgs].reverse();
  const ultimaEntradaTexto = [...historico].reverse().find((m) => !m.fromMe && String(m.texto || '').trim());
  const ultimaSaidaTexto = [...historico].reverse().find((m) => m.fromMe && String(m.texto || '').trim());
  const medida = extrairMedida([
    ultimaEntradaTexto?.texto || '',
    ...historico.filter((m) => !m.fromMe).map((m) => m.texto || ''),
  ].join('\n'));
  const resumo = String(ultimaEntradaTexto?.texto || ultimaSaidaTexto?.texto || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const numero = extrairNumeroDoJid(chatJid, ultimaComNumero?.numeroReal);

  return {
    id: `${usuarioId}::${chatJid}`,
    nome: ultimaComNumero?.chatNome || numero || 'Sem nome',
    telefone: numero,
    medida,
    modeloRecomendado: '',
    viraALoja: false,
    botPausado: !!(estado?.pausadoAte && estado.pausadoAte.getTime() > Date.now()),
    pausaAte: estado?.pausadoAte?.toISOString() || null,
    resumo,
    ultimaMsgEm: ultimaComNumero?.timestamp?.toISOString() || null,
  };
}

router.get('/resumo', async (req, res) => {
  try {
    const permitidos = await usuarioIdsPermitidos(req);
    if (!permitidos.length) return res.json({ kpis: { total: 0, hoje: 0, botPausados: 0 }, contatos: [] });

    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: { in: permitidos } },
      orderBy: { timestamp: 'desc' },
      take: 4000,
      select: {
        id: true,
        usuarioId: true,
        chatJid: true,
        chatNome: true,
        fromMe: true,
        texto: true,
        tipo: true,
        numeroReal: true,
        timestamp: true,
      },
    });

    const estados = await prisma.botConversa.findMany({
      where: { usuarioId: { in: permitidos } },
      select: { usuarioId: true, chatJid: true, pausadoAte: true },
    });
    const pausas = new Map(estados.map((e) => [`${e.usuarioId}::${e.chatJid}`, e]));

    const agrupado = new Map<string, any[]>();
    for (const msg of mensagens) {
      const key = `${msg.usuarioId}::${msg.chatJid}`;
      if (!agrupado.has(key)) agrupado.set(key, []);
      agrupado.get(key)!.push(msg);
    }

    const contatos = Array.from(agrupado.entries()).map(([key, itens]) => {
      const [usuarioId, ...jidRest] = key.split('::');
      const chatJid = jidRest.join('::');
      const ordenadas = [...itens].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
      const ultima = ordenadas[ordenadas.length - 1];
      const ultimaEntrada = [...ordenadas].reverse().find((m) => !m.fromMe && String(m.texto || '').trim());
      const numero = extrairNumeroDoJid(chatJid, ultima?.numeroReal);
      const medida = extrairMedida(ordenadas.filter((m) => !m.fromMe).map((m) => m.texto || '').join('\n'));
      const estado = pausas.get(key);
      const botPausado = !!(estado?.pausadoAte && estado.pausadoAte.getTime() > Date.now());
      return {
        id: key,
        nome: ultima?.chatNome || numero || 'Sem nome',
        telefone: numero,
        medida,
        modeloRecomendado: '',
        viraALoja: false,
        botPausado,
        pausaAte: estado?.pausadoAte?.toISOString() || null,
        resumo: String(ultimaEntrada?.texto || ultima?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        ultimaMsgEm: ultima?.timestamp?.toISOString() || null,
        ultimaMensagem: {
          direcao: ultima?.fromMe ? 'SAIDA' : 'ENTRADA',
          texto: ultima?.texto || (ultima?.tipo === 'imagem' ? '[imagem]' : ultima?.tipo === 'audio' ? '[audio]' : ''),
        },
      };
    }).sort((a, b) => +new Date(b.ultimaMsgEm || 0) - +new Date(a.ultimaMsgEm || 0));

    const hojeIso = new Date().toISOString().slice(0, 10);
    const kpis = {
      total: contatos.length,
      hoje: contatos.filter((c) => String(c.ultimaMsgEm || '').slice(0, 10) === hojeIso).length,
      botPausados: contatos.filter((c) => c.botPausado).length,
    };

    res.json({ kpis, contatos });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao montar resumo do Bot Pneus.' });
  }
});

router.get('/conversa/:id', async (req, res) => {
  try {
    const alvo = await validarContato(req, req.params.id);
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a esta conversa.' });

    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid },
      orderBy: { timestamp: 'asc' },
      take: 400,
    });

    res.json({
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: m.fromMe ? 'SAIDA' : 'ENTRADA',
        tipo: m.tipo,
        conteudo: m.texto || (m.tipo === 'imagem' ? '[imagem]' : m.tipo === 'audio' ? '[audio]' : ''),
        autor: m.fromMe ? (m.enviadoPorId === 'bot' ? '🤖 Robô' : 'ATENDENTE') : 'CLIENTE',
        criadoEm: m.timestamp.toISOString(),
        temMidia: !!m.midiaUrl,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar conversa.' });
  }
});

router.get('/agendamentos/:id', async (req, res) => {
  try {
    const alvo = await validarContato(req, req.params.id);
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a este contato.' });
    const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
    const numero = normalizarNumero(contato.telefone);

    const agendamentos = await prisma.agendamento.findMany({
      where: {
        criadoPorId: alvo.usuarioId,
        numero,
      },
      orderBy: { enviarEm: 'asc' },
      take: 50,
    });

    res.json({
      agendamentos: agendamentos.map((a) => ({
        id: a.id,
        mensagem: a.mensagem,
        enviarEm: a.enviarEm.toISOString(),
        status: a.status,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar agendamentos.' });
  }
});

router.get('/config', async (_req, res) => {
  res.json({ config: lerBotPneusConfig() });
});

router.get('/midia/:id', async (req, res) => {
  try {
    const permitidos = await usuarioIdsPermitidos(req);
    if (!permitidos.length) return res.status(403).json({ error: 'Sem acesso.' });

    const msg = await prisma.mensagem.findFirst({
      where: { id: req.params.id, usuarioId: { in: permitidos } },
      select: { midiaUrl: true, tipo: true },
    });
    if (!msg?.midiaUrl) return res.status(404).json({ error: 'Mídia indisponível.' });

    const raiz = path.resolve(__dirname, '../../public');
    const arquivo = path.resolve(raiz, String(msg.midiaUrl).replace(/^[/\\]+/, ''));
    if (!arquivo.startsWith(raiz + path.sep) || !fs.existsSync(arquivo)) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(arquivo).toLowerCase();
    const mime = msg.tipo === 'audio'
      ? (ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/webm')
      : (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(arquivo).pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar mídia.' });
  }
});

router.post('/acao', async (req, res) => {
  try {
    const action = String(req.body?.action || '');

    if (action === 'salvarConfig') {
      const config = salvarBotPneusConfig(req.body?.config || {});
      return res.json({ ok: true, config });
    }

    if (action === 'cancelarAgendamento') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'Agendamento inválido.' });
      await prisma.agendamento.update({
        where: { id },
        data: { status: 'cancelado' },
      });
      return res.json({ ok: true });
    }

    const alvo = await validarContato(req, String(req.body?.contatoId || ''));
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a este contato.' });

    if (action === 'pausar') {
      const modo = String(req.body?.modo || '').toLowerCase();
      let pausadoAte: Date | null = null;
      if (modo === '1h') pausadoAte = new Date(Date.now() + 60 * 60 * 1000);
      else if (modo === '4h') pausadoAte = new Date(Date.now() + 4 * 60 * 60 * 1000);
      else if (modo === 'manual') pausadoAte = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
      else if (modo === 'reativar') pausadoAte = null;

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid, pausadoAte, motivoPausa: pausadoAte ? 'atendimento_manual' : null },
        update: { pausadoAte, motivoPausa: pausadoAte ? 'atendimento_manual' : null },
      });
      const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
      return res.json({ ok: true, contato });
    }

    if (action === 'enviar') {
      const mensagem = String(req.body?.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ error: 'Mensagem vazia.' });
      const efetivoId = await resolverConexaoEfetiva(alvo.usuarioId);
      const ok = await enviarMensagemInbox(efetivoId, alvo.chatJid, mensagem, alvo.usuarioId);
      if (!ok) return res.status(503).json({ error: 'WhatsApp não conectado para este bot.' });

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: {
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
      });
      return res.json({ ok: true });
    }

    if (action === 'enviarMidia') {
      const tipo = String(req.body?.tipo || '');
      const base64 = String(req.body?.b64 || '');
      const mime = String(req.body?.mime || '');
      if (!tipo || !base64) return res.status(400).json({ error: 'Mídia inválida.' });
      const efetivoId = await resolverConexaoEfetiva(alvo.usuarioId);
      const ok = await enviarMidiaInbox(efetivoId, alvo.chatJid, base64, mime, tipo, undefined, alvo.usuarioId);
      if (!ok) return res.status(503).json({ error: 'WhatsApp não conectado para envio de mídia.' });

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: {
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
      });
      return res.json({ ok: true });
    }

    if (action === 'agendar') {
      const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
      const numero = normalizarNumero(contato.telefone);
      const mensagem = String(req.body?.mensagem || '').trim();
      const enviarEm = new Date(String(req.body?.enviarEm || ''));
      if (!mensagem || !numero || Number.isNaN(+enviarEm)) {
        return res.status(400).json({ error: 'Dados do agendamento inválidos.' });
      }

      const agendamento = await prisma.agendamento.create({
        data: {
          cliente: contato.nome || numero,
          numero,
          mensagem,
          enviarEm,
          criadoPorId: alvo.usuarioId,
          status: 'pendente',
        },
      });
      return res.json({
        ok: true,
        agendamento: {
          id: agendamento.id,
          mensagem: agendamento.mensagem,
          enviarEm: agendamento.enviarEm.toISOString(),
          status: agendamento.status,
        },
      });
    }

    return res.status(400).json({ error: 'Ação não suportada.' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao executar ação no Bot Pneus.' });
  }
});

export default router;
