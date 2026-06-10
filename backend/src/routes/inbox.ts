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

export default router;
