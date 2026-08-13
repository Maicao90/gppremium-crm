import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { hashSenha, conferirSenha } from '../auth/senha';
import { assinarTokenCliente, verificarToken } from '../auth/jwt';

// ===== API do APP de Garantia (cliente final) =====
// Rotas consumidas pelo APP mobile do CLIENTE (não é usuário do CRM). Montado FORA do
// gate requireModulo('garantia50k') — cada rota se protege sozinha (público pra
// registrar/login/oficinas; requireCliente pro resto). O MECÂNICO/loja usa o app com o
// login normal do CRM (/api/usuarios/login) e as rotas /api/garantia/* já existentes.

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });
const soDigitos = (s: string) => String(s || '').replace(/\D/g, '');
const POSICOES = ['dianteiro_esquerdo', 'dianteiro_direito', 'traseiro_esquerdo', 'traseiro_direito', 'estepe'];
const ordenarPneus = <T extends { posicao: string }>(pneus: T[]): T[] => (
  [...pneus].sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao))
);

function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

// Middleware: exige token de CLIENTE (role='cliente'). Popula req.clienteId.
function requireCliente(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = verificarToken(token);
  if (!payload || payload.role !== 'cliente') return res.status(401).json({ error: 'Não autenticado.' });
  (req as any).clienteId = payload.sub;
  next();
}

const clienteOut = (c: any) => ({ id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, email: c.email, nascimento: c.nascimento });

// ---------- Registro / Login ----------

// Cadastro do cliente pelo app. Se o CPF já existe (cadastrado pela loja na venda) mas
// SEM senha, apenas define a senha e completa os dados — assim o cliente "assume" o
// cadastro que a loja criou. Se já tem senha, manda ele fazer login.
router.post('/cliente/registrar', async (req, res) => {
  try {
    const b = req.body || {};
    const cpf = soDigitos(b.cpf);
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido.' });
    if (!String(b.nome || '').trim()) return res.status(400).json({ error: 'Informe seu nome.' });
    const senha = String(b.senha || '');
    if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres.' });

    const existente = await prisma.garantiaCliente.findUnique({ where: { cpf } });
    if (existente && existente.senha) {
      return res.status(409).json({ error: 'Este CPF já tem cadastro. Faça login.' });
    }
    const dados = {
      nome: String(b.nome).trim(),
      telefone: String(b.telefone || '').trim(),
      email: String(b.email || '').trim(),
      nascimento: /^\d{4}-\d{2}-\d{2}$/.test(String(b.nascimento || '')) ? String(b.nascimento) : (existente?.nascimento || ''),
      senha: await hashSenha(senha),
    };
    const cliente = existente
      ? await prisma.garantiaCliente.update({ where: { id: existente.id }, data: dados })
      : await prisma.garantiaCliente.create({ data: { cpf, ...dados } });
    res.status(201).json({ token: assinarTokenCliente(cliente.id), cliente: clienteOut(cliente) });
  } catch (e) { erro(res, e); }
});

router.post('/cliente/login', async (req, res) => {
  try {
    const cpf = soDigitos(req.body?.cpf);
    const senha = String(req.body?.senha || '');
    const cliente = await prisma.garantiaCliente.findUnique({ where: { cpf } });
    if (!cliente || !cliente.senha || !(await conferirSenha(senha, cliente.senha))) {
      return res.status(401).json({ error: 'CPF ou senha incorretos.' });
    }
    res.json({ token: assinarTokenCliente(cliente.id), cliente: clienteOut(cliente) });
  } catch (e) { erro(res, e); }
});

// ---------- Dados do cliente logado ----------

// Tudo que o app do cliente mostra: garantias (com veículo + pneus), revisões e
// notificações — só do próprio cliente.
router.get('/cliente/me', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const cliente = await prisma.garantiaCliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const garantias = await prisma.garantia.findMany({ where: { clienteId }, orderBy: { criadoEm: 'desc' } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } });
    const pneus = await prisma.garantiaPneu.findMany({ where: { garantiaId: { in: garantias.map((g) => g.id) } } });
    const revisoes = await prisma.garantiaRevisao.findMany({ where: { garantiaId: { in: garantias.map((g) => g.id) } }, orderBy: { criadoEm: 'desc' } });
    const revPneus = await prisma.garantiaRevisaoPneu.findMany({ where: { revisaoId: { in: revisoes.map((r) => r.id) } } });
    const notificacoes = await prisma.garantiaNotificacao.findMany({ where: { clienteId }, orderBy: { criadoEm: 'desc' }, take: 50 });
    const lojaIds = [...new Set([
      ...garantias.map((g) => g.lojaId).filter(Boolean),
      ...revisoes.map((r) => r.lojaId).filter(Boolean),
    ] as string[])];
    const usuarioIds = [...new Set(garantias.map((g) => g.criadoPorId).filter(Boolean) as string[])];
    const lojas = lojaIds.length ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } }) : [];
    const usuarios = usuarioIds.length ? await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nome: true } }) : [];

    const veiPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const pneusPorGar: Record<string, typeof pneus> = {};
    pneus.forEach((p) => { (pneusPorGar[p.garantiaId] = pneusPorGar[p.garantiaId] || []).push(p); });
    const revPneusPorRev: Record<string, typeof revPneus> = {};
    revPneus.forEach((p) => { (revPneusPorRev[p.revisaoId] = revPneusPorRev[p.revisaoId] || []).push(p); });
    const revPorGar: Record<string, any[]> = {};
    const lojaPorId = Object.fromEntries(lojas.map((l) => [l.id, { id: l.id, nome: l.store_name }]));
    const usuarioPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));
    revisoes.forEach((r) => {
      (revPorGar[r.garantiaId] = revPorGar[r.garantiaId] || []).push({
        ...r,
        pneus: revPneusPorRev[r.id] || [],
        loja: r.lojaId ? (lojaPorId[r.lojaId] || null) : null,
      });
    });

    res.json({
      cliente: clienteOut(cliente),
      garantias: garantias.map((g) => ({
        ...g,
        veiculo: veiPorId[g.veiculoId] || null,
        pneus: ordenarPneus(pneusPorGar[g.id] || []),
        revisoes: revPorGar[g.id] || [],
        lojaCadastro: g.lojaId ? (lojaPorId[g.lojaId] || null) : null,
        mecanicoCadastro: g.criadoPorId ? (usuarioPorId[g.criadoPorId]?.nome || '') : '',
      })),
      notificacoes: notificacoes.map((n) => {
        const garantia = garantias.find((g) => g.id === n.garantiaId);
        return { ...n, veiculo: garantia ? (veiPorId[garantia.veiculoId] || null) : null };
      }),
    });
  } catch (e) { erro(res, e); }
});

// Registra o token de push do aparelho do cliente (Expo). Idempotente.
router.post('/cliente/push-token', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const pushToken = String(req.body?.pushToken || '').trim();
    await prisma.garantiaCliente.update({ where: { id: clienteId }, data: { pushToken } });
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

// Marca apenas como lida no app. "Enviada" é reservado ao resultado do push.
router.post('/cliente/notificacoes/:id/lida', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const n = await prisma.garantiaNotificacao.findUnique({ where: { id: String(req.params.id) } });
    if (!n || n.clienteId !== clienteId) return res.status(404).json({ error: 'Notificação não encontrada.' });
    await prisma.garantiaNotificacao.update({ where: { id: n.id }, data: { lidaNoApp: true, lidaNoAppEm: new Date() } });
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

// ---------- Oficinas autorizadas (lojas do CRM) ----------
router.get('/oficinas', async (_req, res) => {
  try {
    const lojas = await prisma.loja.findMany({ orderBy: { store_name: 'asc' } });
    res.json(lojas.map((l) => ({
      id: l.id, nome: l.store_name, cidade: l.city, estado: l.state,
      telefone: l.whatsapp || l.telefone_fixo, instagram: l.instagram,
    })));
  } catch (e) { erro(res, e); }
});

export default router;
