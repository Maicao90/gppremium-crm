import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

// Lista de conversas (última mensagem de cada contato) de um atendente
router.get('/conversas', async (req, res) => {
  try {
    const usuarioId = String(req.query.usuarioId || '');
    if (!usuarioId) return res.json([]);

    // DISTINCT ON pega a mensagem mais recente de cada chat
    const conversas: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatJid") "chatJid", "chatNome", "texto", "tipo", "fromMe", "timestamp"
      FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId}
      ORDER BY "chatJid", "timestamp" DESC
    `;
    // Preenche o nome do contato (do mapa de contatos do WhatsApp) quando estiver vazio
    try {
      const { contatosNomes } = require('../workers/whatsappService');
      conversas.forEach((c: any) => {
        if ((!c.chatNome || !String(c.chatNome).trim()) && contatosNomes.has(c.chatJid)) {
          c.chatNome = contatosNomes.get(c.chatJid);
        }
      });
    } catch (e) {}

    // Ordena por mais recente
    conversas.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(conversas);
  } catch (e) {
    console.error('Erro ao buscar conversas:', e);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

// Mensagens de uma conversa específica
router.get('/mensagens', async (req, res) => {
  try {
    const usuarioId = String(req.query.usuarioId || '');
    const jid = String(req.query.jid || '');
    if (!usuarioId || !jid) return res.json([]);

    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId, chatJid: jid },
      orderBy: { timestamp: 'asc' },
      take: 300
    });
    res.json(mensagens);
  } catch (e) {
    console.error('Erro ao buscar mensagens:', e);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Enviar mensagem (texto) pela Caixa de Entrada
router.post('/enviar', async (req, res) => {
  try {
    const { usuarioId, jid, texto } = req.body;
    if (!usuarioId || !jid || !texto) {
      return res.status(400).json({ error: 'usuarioId, jid e texto são obrigatórios.' });
    }
    const { enviarMensagemInbox } = require('../workers/whatsappService');
    const ok = await enviarMensagemInbox(String(usuarioId), String(jid), String(texto));
    if (ok) res.json({ success: true });
    else res.status(503).json({ error: 'WhatsApp não está conectado ou falhou ao enviar.' });
  } catch (e) {
    console.error('Erro ao enviar (inbox):', e);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// ── Mensagens rápidas (templates) — compartilhadas pela equipe ──
router.get('/templates', async (_req, res) => {
  try {
    const templates = await prisma.template.findMany({ orderBy: { criadoEm: 'asc' } });
    res.json(templates);
  } catch (e) {
    console.error('Erro ao buscar templates:', e);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { atalho, texto } = req.body;
    if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto é obrigatório.' });
    const t = await prisma.template.create({ data: { atalho: String(atalho || '').trim(), texto: String(texto).trim() } });
    res.status(201).json(t);
  } catch (e) {
    console.error('Erro ao criar template:', e);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.sendStatus(204);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

export default router;
