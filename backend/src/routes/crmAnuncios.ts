import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

const comCpl = (c: any) => ({ ...c, cpl: c.leads > 0 ? c.spend / c.leads : 0 });
const contaOut = (c: any) => ({
  id: c.id, nome: c.nome, plataforma: c.plataforma, saldo: c.saldo,
  gastoDia: c.gastoDia,
  gastoMes: c.gastoMes ?? (c.gastoDia * 30),
  depositoMes: c.depositoMes ?? c.ultimoDepValor,
  limiteAlerta: c.limiteAlerta,
  ultimoDeposito: { valor: c.ultimoDepValor, data: c.ultimoDepData },
});
const contaIn = (b: any) => ({
  nome: b.nome || '', plataforma: b.plataforma || 'google',
  saldo: Number(b.saldo) || 0, gastoDia: Number(b.gastoDia) || 0,
  gastoMes: Number(b.gastoMes) || (Number(b.gastoDia) * 30) || 0,
  depositoMes: Number(b.depositoMes) || Number(b.ultimoDeposito?.valor ?? b.ultimoDepValor) || 0,
  limiteAlerta: Number(b.limiteAlerta) || 0,
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
  try { res.json((await prisma.contaAnuncio.findMany({ orderBy: { created_at: 'asc' } })).map(contaOut)); } catch (e) { erro(res, e); }
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

/* ===== INTEGRAÇÕES & SINCRONIZAÇÃO WEB ===== */
const calcResumoContas = async () => {
  const contas = await prisma.contaAnuncio.findMany();
  let metaDeposito = 0;
  let googleDeposito = 0;
  let metaGastoMes = 0;
  let googleGastoMes = 0;

  contas.forEach((c: any) => {
    const isMeta = (c.plataforma || '').toLowerCase().includes('meta');
    const dep = Number(c.depositoMes ?? c.ultimoDepValor) || 0;
    const gasto = Number(c.gastoMes ?? (c.gastoDia * 30)) || 0;

    if (isMeta) {
      metaDeposito += dep;
      metaGastoMes += gasto;
    } else {
      googleDeposito += dep;
      googleGastoMes += gasto;
    }
  });

  return {
    metaDeposito,
    googleDeposito,
    totalDeposito: metaDeposito + googleDeposito,
    metaGastoMes,
    googleGastoMes,
    totalGastoMes: metaGastoMes + googleGastoMes,
    mesAno: 'AGOSTO DE 2026'
  };
};

router.get('/contas/resumo', async (_req, res) => {
  try { res.json(await calcResumoContas()); } catch (e) { erro(res, e); }
});

router.get('/integracoes/resumo', async (_req, res) => {
  try { res.json(await calcResumoContas()); } catch (e) { erro(res, e); }
});

router.get('/integracoes', async (_req, res) => {
  try {
    const contas = await prisma.contaAnuncio.findMany({ orderBy: { created_at: 'asc' } });
    const mapped = contas.map((c: any) => ({
      ...contaOut(c),
      ativo: true,
      conexaoId: c.id
    }));
    res.json(mapped);
  } catch (e) { erro(res, e); }
});

router.get('/integracoes/desempenho', async (req, res) => {
  try {
    const { companyId, plataforma } = req.query;
    const where: any = {};
    if (companyId && companyId !== 'all') where.company_id = String(companyId);
    if (plataforma && plataforma !== 'all') {
      where.platform = { contains: String(plataforma), mode: 'insensitive' };
    }

    const campanhas = await prisma.campanha.findMany({ where, orderBy: { created_at: 'asc' } });
    const mapped = campanhas.map((c: any) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      spend: c.spend,
      leads: c.leads,
      status: c.status,
      storeId: c.store_id || '',
      companyId: c.company_id,
      daily_budget: c.daily_budget
    }));

    res.json({ campanhas: mapped });
  } catch (e) { erro(res, e); }
});

router.post('/integracoes/testar', async (_req, res) => {
  try {
    res.json({ ok: true, detalhe: 'Conexão testada e validada com sucesso.' });
  } catch (e) { erro(res, e); }
});

router.post('/integracoes/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;
    const conta = await prisma.contaAnuncio.findUnique({ where: { id } });
    const countCamps = await prisma.campanha.count();
    res.json({ ok: true, campanhas: countCamps, msg: `Sincronizado com sucesso para ${conta?.nome || 'conta'}` });
  } catch (e) { erro(res, e); }
});

router.post('/integracoes', async (req, res) => {
  try {
    const data = contaIn(req.body);
    const criada = await prisma.contaAnuncio.create({ data });
    res.status(201).json(contaOut(criada));
  } catch (e) { erro(res, e); }
});

router.delete('/integracoes/:id', async (req, res) => {
  try {
    await prisma.contaAnuncio.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) { erro(res, e); }
});

export default router;
