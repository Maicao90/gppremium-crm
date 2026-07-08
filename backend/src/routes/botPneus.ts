import { Router } from 'express';

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO BOT PNEUS — proxy pro robô de vendas da GP (pneus-bot na Vercel).
// O painel admin consome ESTAS rotas; o token do bot fica só no servidor (.env),
// nunca no navegador.
//   .env:  PNEUS_BOT_URL   (default https://pneus-bot.vercel.app)
//          PNEUS_BOT_TOKEN (obrigatório — mesmo valor do CRM_TOKEN salvo no bot)
// ══════════════════════════════════════════════════════════════════════════════

const router = Router();
const BASE = process.env.PNEUS_BOT_URL || 'https://pneus-bot.vercel.app';
// fetch global via globalThis (Node 18+) — sem depender do TIPO de fetch, que não existe
// no tsconfig deste backend (types: [], sem lib DOM) e derrubaria o boot do ts-node.
const fetchGlobal: any = (globalThis as any).fetch;

async function proxyBot(caminho: string, res: any) {
  const token = process.env.PNEUS_BOT_TOKEN || '';
  if (!token) {
    return res.status(500).json({
      error: 'PNEUS_BOT_TOKEN não configurado',
      dica: 'Adicione PNEUS_BOT_TOKEN=<token> no .env do backend e reinicie o PM2.',
    });
  }
  if (!fetchGlobal) {
    return res.status(500).json({ error: 'Node sem fetch global — precisa de Node 18+.' });
  }
  try {
    const r = await fetchGlobal(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await r.json().catch(() => ({ error: 'resposta inválida do bot' }));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao falar com o pneus-bot: ' + String(e) });
  }
}

// Resumo: KPIs + últimos 100 contatos do bot
router.get('/resumo', (_req, res) => { proxyBot('/api/crm', res); });

// Conversa completa de um contato do bot
router.get('/conversa/:id', (req, res) => {
  proxyBot(`/api/crm?conversa=${encodeURIComponent(req.params.id)}`, res);
});

export default router;
