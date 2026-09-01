import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

const comCpl = (c: any) => ({ ...c, cpl: c.leads > 0 ? c.spend / c.leads : 0 });
const contaOut = (c: any) => ({
  id: c.id, nome: c.nome, plataforma: c.plataforma, saldo: c.saldo,
  gastoDia: c.gastoDia, limiteAlerta: c.limiteAlerta,
  ultimoDeposito: { valor: c.ultimoDepValor, data: c.ultimoDepData },
  // Preenchido quando a conta é alimentada automaticamente por uma ConexaoAds
  conexaoId: c.conexao_id || null,
});
const contaIn = (b: any) => ({
  nome: b.nome || '', plataforma: b.plataforma || 'google',
  saldo: Number(b.saldo) || 0, gastoDia: Number(b.gastoDia) || 0, limiteAlerta: Number(b.limiteAlerta) || 0,
  ultimoDepValor: Number(b.ultimoDeposito?.valor ?? b.ultimoDepValor) || 0,
  ultimoDepData: String(b.ultimoDeposito?.data ?? b.ultimoDepData ?? ''),
});
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

/* ===== EMPRESAS ===== */
router.get('/empresas', async (_req, res) => {
  try { res.json(await prisma.empresa.findMany({ orderBy: { created_at: 'asc' } })); } catch (e) { erro(res, e); }
});
router.post('/empresas', async (req, res) => {
  try {
    const { name, segment, notes } = req.body;
    res.status(201).json(await prisma.empresa.create({ data: { name: name || '', segment: segment || '', notes: notes || '' } }));
  } catch (e) { erro(res, e); }
});
router.put('/empresas/:id', async (req, res) => {
  try {
    const d: any = {};
    ['name', 'segment', 'notes'].forEach((k) => { if (req.body[k] !== undefined) d[k] = req.body[k]; });
    res.json(await prisma.empresa.update({ where: { id: req.params.id }, data: d }));
  } catch (e) { erro(res, e); }
});
router.delete('/empresas/:id', async (req, res) => {
  try { await prisma.empresa.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

/* ===== LOJAS ===== */
const LOJA = ['company_id', 'store_name', 'city', 'state', 'whatsapp', 'telefone_fixo', 'site', 'instagram', 'manager_name', 'notes'];
router.get('/lojas', async (_req, res) => {
  try { res.json(await prisma.loja.findMany({ orderBy: { created_at: 'asc' } })); } catch (e) { erro(res, e); }
});
router.post('/lojas', async (req, res) => {
  try {
    const d: any = {}; LOJA.forEach((k) => { d[k] = req.body[k] ?? ''; });
    if (!d.company_id) return res.status(400).json({ error: 'company_id obrigatório' });
    res.status(201).json(await prisma.loja.create({ data: d }));
  } catch (e) { erro(res, e); }
});
router.put('/lojas/:id', async (req, res) => {
  try {
    const d: any = {}; LOJA.forEach((k) => { if (req.body[k] !== undefined) d[k] = req.body[k]; });
    res.json(await prisma.loja.update({ where: { id: req.params.id }, data: d }));
  } catch (e) { erro(res, e); }
});
router.delete('/lojas/:id', async (req, res) => {
  try { await prisma.loja.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

/* ===== CAMPANHAS (Anúncios) ===== */
const CAMP = ['company_id', 'store_id', 'name', 'platform', 'status', 'spend', 'leads', 'daily_budget', 'keywords'];
const campData = (body: any, novo = false) => {
  const d: any = {};
  CAMP.forEach((k) => { if (body[k] !== undefined) d[k] = body[k]; });
  if (novo) d.company_id = d.company_id || '';
  if (d.store_id === '') d.store_id = null;
  if (d.spend !== undefined) d.spend = Number(d.spend) || 0;
  if (d.leads !== undefined) d.leads = Number(d.leads) || 0;
  if (d.daily_budget !== undefined && d.daily_budget !== null && d.daily_budget !== '') d.daily_budget = Number(d.daily_budget);
  return d;
};
router.get('/campanhas', async (_req, res) => {
  try { res.json((await prisma.campanha.findMany({ orderBy: { created_at: 'asc' } })).map(comCpl)); } catch (e) { erro(res, e); }
});
router.post('/campanhas', async (req, res) => {
  try {
    const d = campData(req.body, true);
    if (!d.company_id) return res.status(400).json({ error: 'company_id obrigatório' });
    res.status(201).json(comCpl(await prisma.campanha.create({ data: d })));
  } catch (e) { erro(res, e); }
});
router.put('/campanhas/:id', async (req, res) => {
  try { res.json(comCpl(await prisma.campanha.update({ where: { id: req.params.id }, data: campData(req.body) }))); } catch (e) { erro(res, e); }
});
router.delete('/campanhas/:id', async (req, res) => {
  try { await prisma.campanha.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

/* ===== CONTAS (Saldos) ===== */
router.get('/contas', async (_req, res) => {
  try {
    // Junta a LOJA de cada conta (via ConexaoAds.store_id) pra tela agrupar os saldos
    // de Google e Meta da mesma loja numa caixinha só.
    const [contas, conexoes] = await Promise.all([
      prisma.contaAnuncio.findMany({ orderBy: { created_at: 'asc' } }),
      prisma.conexaoAds.findMany({ select: { id: true, store_id: true } }),
    ]);
    const storePorConexao: Record<string, string | null> = {};
    conexoes.forEach((cx) => { storePorConexao[cx.id] = cx.store_id ?? null; });
    res.json(contas.map((c) => ({ ...contaOut(c), storeId: c.conexao_id ? (storePorConexao[c.conexao_id] ?? null) : null })));
  } catch (e) { erro(res, e); }
});
router.post('/contas', async (req, res) => {
  try { res.status(201).json(contaOut(await prisma.contaAnuncio.create({ data: contaIn(req.body) }))); } catch (e) { erro(res, e); }
});
router.put('/contas/:id', async (req, res) => {
  try { res.json(contaOut(await prisma.contaAnuncio.update({ where: { id: req.params.id }, data: contaIn(req.body) }))); } catch (e) { erro(res, e); }
});
router.delete('/contas/:id', async (req, res) => {
  try { await prisma.contaAnuncio.delete({ where: { id: req.params.id } }); res.json({ success: true }); } catch (e) { erro(res, e); }
});

export default router;
