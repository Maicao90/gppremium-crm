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

function token(): string { return process.env.PNEUS_BOT_TOKEN || ''; }
function prontos(res: any): boolean {
  if (!token()) { res.status(500).json({ error: 'PNEUS_BOT_TOKEN não configurado', dica: 'Adicione PNEUS_BOT_TOKEN=<token> no .env do backend e reinicie o PM2.' }); return false; }
  if (!fetchGlobal) { res.status(500).json({ error: 'Node sem fetch global — precisa de Node 18+.' }); return false; }
  return true;
}

// Proxy JSON simples (GET) pro bot, com o Bearer.
async function proxyBot(caminho: string, res: any) {
  if (!prontos(res)) return;
  try {
    const r = await fetchGlobal(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token()}` } });
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

// Agendamentos de um contato
router.get('/agendamentos/:id', (req, res) => {
  proxyBot(`/api/crm?agendamentos=${encodeURIComponent(req.params.id)}`, res);
});

// Configurações do bot (SEM credenciais — o backend do bot filtra)
router.get('/config', (_req, res) => { proxyBot('/api/crm?config=1', res); });

// Mídia (foto/áudio) de uma mensagem — stream de BYTES (não é JSON).
// A tag <img>/<audio> do painel aponta pra cá; o token nunca aparece no navegador.
router.get('/midia/:id', async (req, res) => {
  if (!prontos(res)) return;
  try {
    const r = await fetchGlobal(`${BASE}/api/crm?midia=${encodeURIComponent(req.params.id)}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!r.ok) { res.status(r.status).json({ error: 'mídia indisponível' }); return; }
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao buscar mídia: ' + String(e) });
  }
});

// Ações do atendente (pausar / enviar / agendar / cancelarAgendamento) — POST.
router.post('/acao', async (req, res) => {
  if (!prontos(res)) return;
  try {
    const r = await fetchGlobal(`${BASE}/api/crm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const body = await r.json().catch(() => ({ error: 'resposta inválida do bot' }));
    res.status(r.status).json(body);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao falar com o pneus-bot: ' + String(e) });
  }
});

export default router;
