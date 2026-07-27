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
    if (req.body.credenciadaGarantia !== undefined) d.credenciadaGarantia = Boolean(req.body.credenciadaGarantia);
    if (!d.company_id) return res.status(400).json({ error: 'company_id obrigatório' });
    res.status(201).json(await prisma.loja.create({ data: d }));
  } catch (e) { erro(res, e); }
});
router.put('/lojas/:id', async (req, res) => {
  try {
    const d: any = {}; LOJA.forEach((k) => { if (req.body[k] !== undefined) d[k] = req.body[k]; });
    if (req.body.credenciadaGarantia !== undefined) d.credenciadaGarantia = Boolean(req.body.credenciadaGarantia);
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

// Primeiro/último dia (YYYY-MM-DD) de um mês "YYYY-MM" — usado pra somar depósitos
// no intervalo (comparação de string funciona pois o formato é sempre YYYY-MM-DD).
function limitesMes(mes: string): { de: string; ate: string } {
  const partes = mes.split('-');
  const ano = Number(partes[0]);
  const mesNum = Number(partes[1]);
  const ultimoDia = new Date(ano, mesNum, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}
const mesAtualStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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

    // Depósitos do MÊS ATUAL de cada conta (1 query pra todas, sem N+1) — assim o card
    // já nasce mostrando o total E o dia de cada depósito, sem precisar clicar nas
    // setas pra carregar o detalhe (antes só o total vinha pronto, o dia de cada um só
    // aparecia depois de navegar de mês, o que parecia "não estar puxando certo").
    const mesAtual = mesAtualStr();
    const { de, ate } = limitesMes(mesAtual);
    const depositosMes = await prisma.deposito.findMany({ where: { data: { gte: de, lte: ate } }, orderBy: { data: 'asc' } });
    const totalPorConta: Record<string, number> = {};
    const depositosPorConta: Record<string, { id: string; valor: number; data: string }[]> = {};
    depositosMes.forEach((d) => {
      totalPorConta[d.contaId] = (totalPorConta[d.contaId] || 0) + d.valor;
      (depositosPorConta[d.contaId] = depositosPorConta[d.contaId] || []).push({ id: d.id, valor: d.valor, data: d.data });
    });

    res.json(contas.map((c) => ({
      ...contaOut(c),
      storeId: c.conexao_id ? (storePorConexao[c.conexao_id] ?? null) : null,
      depositoMesAtual: { mes: mesAtual, total: totalPorConta[c.id] || 0, depositos: depositosPorConta[c.id] || [] },
    })));
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

// Registra um depósito NOVO (soma ao histórico, não sobrescreve). Recalcula
// ultimoDepValor/ultimoDepData a partir do depósito mais recente de verdade (não
// assume que o que acabou de entrar é o mais novo — o valor pode ter sido lançado
// fora de ordem).
router.post('/contas/:id/depositos', async (req, res) => {
  try {
    const valor = Number(req.body.valor);
    const data = String(req.body.data || '').slice(0, 10);
    if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Valor de depósito inválido.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Data de depósito inválida.' });
    await prisma.deposito.create({ data: { contaId: req.params.id, valor, data } });
    const maisRecente = await prisma.deposito.findFirst({ where: { contaId: req.params.id }, orderBy: { data: 'desc' } });
    if (maisRecente) {
      await prisma.contaAnuncio.update({ where: { id: req.params.id }, data: { ultimoDepValor: maisRecente.valor, ultimoDepData: maisRecente.data } });
    }
    const conta = await prisma.contaAnuncio.findUnique({ where: { id: req.params.id } });
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
    res.status(201).json(contaOut(conta));
  } catch (e) { erro(res, e); }
});

// Total (e lista) de depósitos de UMA conta num mês específico — usado pelas setas
// ‹ › de navegação de mês na tela de Saldos.
router.get('/contas/:id/depositos-mes', async (req, res) => {
  try {
    const mes = String(req.query.mes || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mês inválido (use YYYY-MM).' });
    const { de, ate } = limitesMes(mes);
    const depositos = await prisma.deposito.findMany({
      where: { contaId: req.params.id, data: { gte: de, lte: ate } },
      orderBy: { data: 'asc' },
    });
    const total = depositos.reduce((a, d) => a + d.valor, 0);
    res.json({ mes, total, depositos: depositos.map((d) => ({ id: d.id, valor: d.valor, data: d.data })) });
  } catch (e) { erro(res, e); }
});

// Remove um lançamento de depósito (corrigir um valor/data errados) e recalcula
// ultimoDepValor/ultimoDepData a partir do que sobrou no histórico.
router.delete('/contas/:id/depositos/:depositoId', async (req, res) => {
  try {
    await prisma.deposito.delete({ where: { id: req.params.depositoId } });
    const maisRecente = await prisma.deposito.findFirst({ where: { contaId: req.params.id }, orderBy: { data: 'desc' } });
    await prisma.contaAnuncio.update({
      where: { id: req.params.id },
      data: { ultimoDepValor: maisRecente?.valor ?? 0, ultimoDepData: maisRecente?.data ?? '' },
    });
    res.json({ success: true });
  } catch (e) { erro(res, e); }
});

export default router;
