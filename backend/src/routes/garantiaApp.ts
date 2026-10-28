import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../server';
import { hashSenha, conferirSenha } from '../auth/senha';
import { assinarTokenCliente, verificarToken } from '../auth/jwt';
import crypto from 'crypto';
import { notificacaoSaida, emailBoasVindas } from '../services/garantiaAvisos';
import { enviarEmailGarantia, emailConfigurado } from '../services/garantiaEmail';
import { EM_ANDAMENTO, calendarioDoCarro } from '../services/garantiaCarro';
import {
  PROVEDORES, Provedor, TokenSocialInvalido, verificarIdToken, acharVinculo, vinculosDoCliente,
  salvarVinculo, removerVinculo, removerVinculosDoCliente,
} from '../services/garantiaLoginSocial';

// Base das URLs de foto devolvidas ao app (as fotos ficam em public/midias/garantia e o
// express.static do CRM serve /midias/...).
const MIDIAS_BASE = (process.env.GARANTIA_MIDIAS_BASE || 'https://crm.nailacademyprofissional.com').replace(/\/+$/, '');
const urlAbsoluta = (u: string | null | undefined) => (u && /^\/midias\//.test(u) ? MIDIAS_BASE + u : '');

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

type GarantiaNumeravel = { id: string; veiculoId: string; criadoEm: Date };
type PneuNumeravel = { id: string; garantiaId: string; posicao: string; criadoEm: Date };

const criarMapaNumerosPneus = <G extends GarantiaNumeravel, P extends PneuNumeravel>(garantias: G[], pneus: P[]): Map<string, number> => {
  const garantiasPorVeiculo: Record<string, G[]> = {};
  const pneusPorGarantia: Record<string, P[]> = {};
  garantias.forEach((g) => { (garantiasPorVeiculo[g.veiculoId] = garantiasPorVeiculo[g.veiculoId] || []).push(g); });
  pneus.forEach((p) => { (pneusPorGarantia[p.garantiaId] = pneusPorGarantia[p.garantiaId] || []).push(p); });

  const numeros = new Map<string, number>();
  Object.values(garantiasPorVeiculo).forEach((lista) => {
    let numero = 1;
    lista
      .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id.localeCompare(b.id))
      .forEach((g) => ordenarPneus(pneusPorGarantia[g.id] || []).forEach((p) => numeros.set(p.id, numero++)));
  });
  return numeros;
};

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
    // Conta criada com Apple/Google (sem senha): não deixa outra pessoa "assumir" o CPF
    // definindo uma senha. Quem quiser senha usa "Esqueci minha senha" (código no e-mail).
    if (existente && vinculosDoCliente(existente.id).length) {
      return res.status(409).json({ error: 'Este CPF já tem conta com login da Apple/Google. Entre por lá.' });
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
    emailBoasVindas({ nome: cliente.nome, email: cliente.email }); // assíncrono; falha só loga
    res.status(201).json({ token: assinarTokenCliente(cliente.id), cliente: clienteOut(cliente) });
  } catch (e) { erro(res, e); }
});

// Login por CPF OU e-mail (pedido do dono 28/10). `login` (novo) ou `cpf` (app antigo).
// Tem letra ou "@" → e-mail (sem maiúsculas/espaços); senão → CPF (só dígitos). E-mail NÃO
// é único no banco: se estiver em mais de um cliente, pede o CPF (sem mudar schema).
const EMAIL_DUPLICADO = 'Esse e-mail está em mais de um cadastro. Entre com o CPF.';
async function resolverLogin(body: any): Promise<{ porEmail: boolean; chave: string; cliente: any | null; erro?: string }> {
  const bruto = String(body?.login ?? body?.cpf ?? '').trim();
  if (/[a-z@]/i.test(bruto)) {
    const email = bruto.toLowerCase();
    const achados = await prisma.garantiaCliente.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, take: 2 });
    if (achados.length > 1) return { porEmail: true, chave: email, cliente: null, erro: EMAIL_DUPLICADO };
    return { porEmail: true, chave: email, cliente: achados[0] || null };
  }
  const cpf = soDigitos(bruto);
  const cliente = cpf ? await prisma.garantiaCliente.findUnique({ where: { cpf } }) : null;
  return { porEmail: false, chave: cpf, cliente };
}

router.post('/cliente/login', async (req, res) => {
  try {
    const senha = String(req.body?.senha || '');
    const r = await resolverLogin(req.body);
    if (r.erro) return res.status(400).json({ error: r.erro });
    const cliente = r.cliente;
    if (!cliente || !cliente.senha || !(await conferirSenha(senha, cliente.senha))) {
      return res.status(401).json({ error: r.porEmail ? 'E-mail ou senha incorretos.' : 'CPF ou senha incorretos.' });
    }
    res.json({ token: assinarTokenCliente(cliente.id), cliente: clienteOut(cliente) });
  } catch (e) { erro(res, e); }
});

// ---------- Entrar / criar conta com Apple ou Google (1.1.4) ----------
// { provedor: 'apple'|'google', idToken, nome?, email?, cpf? }. idToken verificado de verdade
// (assinatura JWKS + iss + aud + exp — services/garantiaLoginSocial).
// - provedor+sub já vinculado → { token, cliente } (igual /cliente/login);
// - sem vínculo e sem cpf → { precisaCpf: true, nome, email } (app pede o CPF e chama de novo);
// - sem vínculo com cpf → acha/cria o cliente pelo CPF e vincula. Se o CPF JÁ tem conta (senha
//   ou outro login social) e o e-mail VERIFICADO do provedor não bate com o do cadastro → 409.
// Só o e-mail de DENTRO do token conta pra essa comparação; o `email` do body (Apple manda
// e-mail/nome só na 1ª vez, fora do token) só é guardado em cadastro novo/vazio.
const MSG_CPF_COM_CONTA = 'Esse CPF já tem conta. Entre com CPF e senha e depois ligue o login da Apple/Google na sua conta.';
const MSG_TOKEN_SOCIAL = 'Não foi possível confirmar seu login. Tente de novo.';

async function identidadeSocial(body: any, res: Response) {
  const provedor = String(body?.provedor || '') as Provedor;
  if (!PROVEDORES.includes(provedor)) { res.status(400).json({ error: 'Provedor inválido.' }); return null; }
  if (!body?.idToken) { res.status(400).json({ error: 'Faltou o idToken.' }); return null; }
  try {
    return await verificarIdToken(provedor, String(body.idToken));
  } catch (e: any) {
    if (e instanceof TokenSocialInvalido) { res.status(401).json({ error: MSG_TOKEN_SOCIAL }); return null; }
    console.error('[loginSocial] falha ao verificar token:', e?.message);
    res.status(503).json({ error: 'Não deu para falar com a Apple/Google agora. Tente de novo em instantes.' });
    return null;
  }
}

router.post('/cliente/login-social', async (req, res) => {
  try {
    const b = req.body || {};
    const id = await identidadeSocial(b, res);
    if (!id) return;
    const vinc = acharVinculo(id.provedor, id.sub);
    if (vinc) {
      const c = await prisma.garantiaCliente.findUnique({ where: { id: vinc.clienteId } });
      if (c) return res.json({ token: assinarTokenCliente(c.id), cliente: clienteOut(c) });
      removerVinculo(id.provedor, id.sub); // cliente apagado no painel → vínculo órfão
    }
    const nome = String(b.nome || '').trim().slice(0, 120) || id.nome;
    const emailBody = String(b.email || '').trim().toLowerCase();
    const emailGuardar = id.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBody) ? emailBody : '');
    const cpf = soDigitos(b.cpf);
    if (!cpf) return res.json({ precisaCpf: true, nome, email: emailGuardar });
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido.' });

    const existente = await prisma.garantiaCliente.findUnique({ where: { cpf } });
    let cliente;
    if (existente) {
      const jaTemConta = !!existente.senha || vinculosDoCliente(existente.id).length > 0;
      const emailBate = !!id.email && id.emailVerificado && String(existente.email || '').trim().toLowerCase() === id.email;
      if (jaTemConta && !emailBate) return res.status(409).json({ error: MSG_CPF_COM_CONTA });
      // Cadastro feito pela loja (sem senha): completa o que estiver vazio.
      cliente = await prisma.garantiaCliente.update({
        where: { id: existente.id },
        data: {
          ...(!String(existente.nome || '').trim() && nome ? { nome } : {}),
          ...(!String(existente.email || '').trim() && emailGuardar ? { email: emailGuardar } : {}),
        },
      });
    } else {
      cliente = await prisma.garantiaCliente.create({ data: { cpf, nome, email: emailGuardar } });
      emailBoasVindas({ nome: cliente.nome, email: cliente.email }); // assíncrono; falha só loga
    }
    salvarVinculo({ provedor: id.provedor, sub: id.sub, clienteId: cliente.id, email: id.email });
    res.json({ token: assinarTokenCliente(cliente.id), cliente: clienteOut(cliente) });
  } catch (e) { erro(res, e); }
});

// Liga Apple/Google na conta JÁ logada (o caminho que a mensagem do 409 manda seguir).
// { provedor, idToken } → { ok, loginSocial }. Esse login já ligado em OUTRA conta → 409.
router.post('/cliente/vincular-social', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const id = await identidadeSocial(req.body, res);
    if (!id) return;
    const vinc = acharVinculo(id.provedor, id.sub);
    if (vinc && vinc.clienteId !== clienteId) {
      const outro = await prisma.garantiaCliente.findUnique({ where: { id: vinc.clienteId }, select: { id: true } });
      if (outro) return res.status(409).json({ error: 'Esse login da Apple/Google já está ligado a outra conta.' });
    }
    salvarVinculo({ provedor: id.provedor, sub: id.sub, clienteId, email: id.email });
    res.json({ ok: true, loginSocial: [...new Set(vinculosDoCliente(clienteId).map((v) => v.provedor))] });
  } catch (e) { erro(res, e); }
});

// ---------- Esqueci minha senha ----------
// CPF → código de 6 dígitos no e-mail cadastrado → senha nova. Só em memória (Map): guarda
// o HASH do código, vale 15 min, 5 tentativas; no máximo 3 pedidos/hora por CPF. Reiniciar
// o CRM apaga os códigos pendentes (o cliente só pede de novo). A resposta não revela se o
// CPF existe — exceto "cadastro sem e-mail", que precisa mandar o cliente à loja.
const CODIGO_VALIDADE_MS = 15 * 60 * 1000;
const CODIGO_TENTATIVAS = 5;
const PEDIDOS_POR_HORA = 3;
const codigos = new Map<string, { hash: string; expira: number; tentativas: number }>();
const pedidosRecentes = new Map<string, number[]>();
const hashCodigo = (cpf: string, codigo: string) =>
  crypto.createHmac('sha256', String(process.env.JWT_SECRET || 'gp-garantia')).update(`${cpf}:${codigo}`).digest('hex');
const mascararEmail = (email: string) => {
  const [u = '', d = ''] = String(email).split('@');
  return `${u.slice(0, 2)}***@${d}`;
};
function limparExpirados(): void {
  const agora = Date.now();
  for (const [k, v] of codigos) if (v.expira < agora) codigos.delete(k);
  for (const [k, v] of pedidosRecentes) {
    const vivos = v.filter((t) => agora - t < 3600000);
    if (vivos.length) pedidosRecentes.set(k, vivos); else pedidosRecentes.delete(k);
  }
}

router.post('/cliente/esqueci-senha', async (req, res) => {
  try {
    limparExpirados();
    const r = await resolverLogin(req.body);
    if (!r.porEmail && !cpfValido(r.chave)) return res.status(400).json({ error: 'CPF inválido.' });
    if (r.porEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.chave)) return res.status(400).json({ error: 'E-mail inválido.' });
    if (r.erro) return res.status(400).json({ error: r.erro });
    // Limite por CPF do cliente (ou pelo que foi digitado, se não achou) — vale exista ou
    // não o cadastro (não vira oráculo).
    const chaveLimite = r.cliente?.cpf || r.chave;
    const pedidos = pedidosRecentes.get(chaveLimite) || [];
    if (pedidos.length >= PEDIDOS_POR_HORA) {
      return res.status(429).json({ error: 'Você já pediu muitos códigos. Tente de novo daqui a uma hora.' });
    }
    pedidosRecentes.set(chaveLimite, [...pedidos, Date.now()]);

    const cliente = r.cliente as { id: string; cpf: string; nome: string; email: string } | null;
    if (!cliente) return res.json({ ok: true });
    const cpf = cliente.cpf;
    const email = String(cliente.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Seu cadastro não tem e-mail. Procure a loja GP Premium para trocar a senha.' });
    }
    if (!emailConfigurado()) {
      return res.status(503).json({ error: 'O envio de e-mail está indisponível no momento. Procure a loja GP Premium para trocar a senha.' });
    }
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    codigos.set(cpf, { hash: hashCodigo(cpf, codigo), expira: Date.now() + CODIGO_VALIDADE_MS, tentativas: 0 });
    const nome = String(cliente.nome || '').trim().split(/\s+/)[0] || 'cliente';
    enviarEmailGarantia({
      para: email,
      assunto: `${codigo} é o seu código GP Premium`,
      titulo: 'Código para criar uma senha nova',
      texto: `Olá ${nome}! Use o código abaixo no app Pneus GP Premium para criar uma senha nova. Ele vale por 15 minutos.`,
      destaque: codigo,
      rodapeExtra: 'Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.',
    }).catch(() => { /* enviarEmailGarantia já loga */ });
    res.json({ ok: true, emailMascarado: mascararEmail(email) });
  } catch (e) { erro(res, e); }
});

router.post('/cliente/redefinir-senha', async (req, res) => {
  try {
    limparExpirados();
    const codigo = soDigitos(req.body?.codigo);
    const senha = String(req.body?.senha || '');
    if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres.' });
    const r = await resolverLogin(req.body);
    if (r.erro) return res.status(400).json({ error: r.erro });
    const invalido = 'Código inválido ou vencido. Peça um código novo.';
    const cpf = r.cliente?.cpf || (r.porEmail ? '' : r.chave);
    const pend = cpf ? codigos.get(cpf) : undefined;
    if (!pend || pend.expira < Date.now() || codigo.length !== 6) return res.status(400).json({ error: invalido });
    pend.tentativas++;
    const a = Buffer.from(pend.hash, 'hex');
    const b = Buffer.from(hashCodigo(cpf, codigo), 'hex');
    if (!crypto.timingSafeEqual(a, b)) {
      if (pend.tentativas >= CODIGO_TENTATIVAS) {
        codigos.delete(cpf);
        return res.status(400).json({ error: 'Código errado várias vezes. Peça um código novo.' });
      }
      return res.status(400).json({ error: 'Código incorreto. Confira o e-mail e tente de novo.' });
    }
    codigos.delete(cpf);
    const cliente = await prisma.garantiaCliente.findUnique({ where: { cpf } });
    if (!cliente) return res.status(400).json({ error: invalido });
    const atualizado = await prisma.garantiaCliente.update({ where: { id: cliente.id }, data: { senha: await hashSenha(senha) } });
    res.json({ ok: true, token: assinarTokenCliente(atualizado.id), cliente: clienteOut(atualizado) });
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
    const numerosPneus = criarMapaNumerosPneus(garantias, pneus);
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

    // Intervalo de revisão (linha do tempo de revisões no app: 60.000 km / 5.000 km = 12).
    const cfg = await prisma.garantiaConfig.findUnique({ where: { id: 'global' } });
    // 1.1.4: próxima revisão é do CARRO (calendário do veículo). Só garantia em andamento tem.
    const proximaPorVeiculo: Record<string, number | null> = {};
    for (const vid of [...new Set(garantias.map((g) => g.veiculoId))]) {
      proximaPorVeiculo[vid] = (await calendarioDoCarro(vid, cfg?.intervaloRevisaoKm || 5000)).proximaRevisaoKm;
    }
    res.json({
      cliente: { ...clienteOut(cliente), loginSocial: [...new Set(vinculosDoCliente(cliente.id).map((v) => v.provedor))], temSenha: !!cliente.senha },
      config: { intervaloKm: cfg?.intervaloRevisaoKm || 5000, garantiaKm: cfg?.garantiaKm || 60000 },
      garantias: garantias.map((g) => ({
        ...g,
        veiculo: veiPorId[g.veiculoId] || null,
        pneus: ordenarPneus(pneusPorGar[g.id] || []).map((p) => ({ ...p, numero: numerosPneus.get(p.id) || 1 })),
        revisoes: revPorGar[g.id] || [],
        proximaRevisaoKm: EM_ANDAMENTO.includes(g.status) ? (proximaPorVeiculo[g.veiculoId] ?? null) : null,
        lojaCadastro: g.lojaId ? (lojaPorId[g.lojaId] || null) : null,
        mecanicoCadastro: g.criadoPorId ? (usuarioPorId[g.criadoPorId]?.nome || '') : '',
      })),
      // Cada notificação: { ...campos, tipo, titulo, mensagem (sem o cabeçalho interno), vistoriaId? }.
      // Aviso novo já traz veículo/placa no texto; a antiga (sem cabeçalho) ganha "Veículo: ...".
      notificacoes: notificacoes.map((n) => {
        const saida = notificacaoSaida(n);
        const nova = n.mensagem.startsWith('\u0001');
        const garantia = nova ? null : garantias.find((g) => g.id === n.garantiaId);
        const veiculo = garantia ? (veiPorId[garantia.veiculoId] || null) : null;
        const identificacao = veiculo
          ? `${[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || 'Veículo'} • placa ${veiculo.placa}`
          : '';
        return {
          ...saida,
          mensagem: identificacao ? `${saida.mensagem}\n\nVeículo: ${identificacao}` : saida.mensagem,
        };
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

// ---------- Excluir a PRÓPRIA conta do app (exigência da App Store) ----------
// Pede a senha de novo. Apaga o ACESSO e os dados pessoais do app (senha, token de push, e-mail,
// nascimento). Não apaga a garantia nem as revisões: são registros do contrato com a loja
// credenciada (nome, CPF e telefone ficam ligados a eles — a política de privacidade avisa).
// Se a pessoa quiser usar o app de novo, o cadastro pelo CPF reaproveita o registro.
router.post('/cliente/excluir-conta', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const senha = String(req.body?.senha || '');
    const cliente = await prisma.garantiaCliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return res.status(404).json({ error: 'Conta não encontrada.' });
    // Conta só com Apple/Google (sem senha): o token do app já prova quem é — não tem senha
    // pra pedir. Conta com senha: continua pedindo a senha.
    const soSocial = !cliente.senha && vinculosDoCliente(clienteId).length > 0;
    if (!soSocial && (!cliente.senha || !(await conferirSenha(senha, cliente.senha)))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    await prisma.garantiaCliente.update({
      where: { id: clienteId },
      data: { senha: '', pushToken: '', email: '', nascimento: '' },
    });
    removerVinculosDoCliente(clienteId); // 1.1.4: apaga os vínculos Apple/Google
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

// ---------- Vistorias de entrada do carro do cliente ----------
// Só vistorias cujas PLACAS são de veículos do próprio cliente (GarantiaVeiculo.clienteId).
// Nada de nome/telefone do cliente, mecânico ou "objeto de valor" — só o estado do carro.
const tipoVistoria = (v: { combustivel: string }): 'completa' | 'rapida' => (v.combustivel ? 'completa' : 'rapida');
const lista = (s: string): any[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
const objeto = (s: string): Record<string, any> => {
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
const FOTOS_FIXAS: [string, string][] = [
  ['fotoOdometroUrl', 'Odômetro'], ['fotoPainelUrl', 'Painel'], ['fotoFrenteUrl', 'Frente'],
  ['fotoTraseiraUrl', 'Traseira'], ['fotoLadoEsquerdoUrl', 'Lado esquerdo'], ['fotoLadoDireitoUrl', 'Lado direito'],
];
function fotosDaVistoria(v: any): { rotulo: string; url: string }[] {
  const rapida = tipoVistoria(v) === 'rapida';
  const fixas = FOTOS_FIXAS.map(([campo, rotulo]) => ({ rotulo, url: urlAbsoluta(v[campo]) }));
  const extras = lista(v.fotosAvarias).map((u, i) => ({ rotulo: rapida ? `Foto ${i + 1}` : `Avaria ${i + 1}`, url: urlAbsoluta(String(u)) }));
  return [...fixas, ...extras].filter((f) => f.url);
}
async function placasDoCliente(clienteId: string) {
  return prisma.garantiaVeiculo.findMany({ where: { clienteId }, select: { placa: true, marca: true, modelo: true, ano: true } });
}
const nomeVeiculo = (vei: { marca: string; modelo: string; ano: number } | undefined, texto: string) =>
  (vei ? [vei.marca, vei.modelo, vei.ano > 0 ? String(vei.ano) : ''].map((s) => String(s || '').trim()).filter(Boolean).join(' ') : '') || texto || '';

router.get('/cliente/vistorias', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const veiculos = await placasDoCliente(clienteId);
    if (!veiculos.length) return res.json({ vistorias: [] });
    const veiPorPlaca = Object.fromEntries(veiculos.map((v) => [v.placa, v]));
    const vistorias = await prisma.garantiaVistoria.findMany({
      where: { placa: { in: veiculos.map((v) => v.placa) } }, orderBy: { criadoEm: 'desc' }, take: 30,
    });
    const lojaIds = [...new Set(vistorias.map((v) => v.lojaId).filter(Boolean) as string[])];
    const lojas = lojaIds.length ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } }) : [];
    const lojaPorId = Object.fromEntries(lojas.map((l) => [l.id, l.store_name]));
    res.json({
      vistorias: vistorias.map((v) => {
        const tipo = tipoVistoria(v);
        const fotos = fotosDaVistoria(v);
        // Miniatura da lista no app: a frente do carro se tiver, senão a 1ª foto.
        const capa = fotos.find((f) => f.rotulo === 'Frente') || fotos[0];
        return {
          id: v.id, placa: v.placa, tipo, criadoEm: v.criadoEm,
          loja: v.lojaId ? (lojaPorId[v.lojaId] || '') : '',
          km: tipo === 'rapida' && !v.km ? null : v.km,
          pedidoCliente: v.pedidoCliente,
          veiculo: nomeVeiculo(veiPorPlaca[v.placa], v.veiculo),
          qtdFotos: fotos.length,
          fotoCapa: capa ? capa.url : '',
        };
      }),
    });
  } catch (e) { erro(res, e); }
});

router.get('/cliente/vistorias/:id', requireCliente, async (req, res) => {
  try {
    const clienteId = (req as any).clienteId as string;
    const v = await prisma.garantiaVistoria.findUnique({ where: { id: String(req.params.id) } });
    const vei = v ? await prisma.garantiaVeiculo.findUnique({ where: { placa: v.placa }, select: { clienteId: true, marca: true, modelo: true, ano: true } }) : null;
    if (!v || !vei || vei.clienteId !== clienteId) return res.status(404).json({ error: 'Vistoria não encontrada.' });
    const loja = v.lojaId ? await prisma.loja.findUnique({ where: { id: v.lojaId }, select: { store_name: true } }) : null;
    const tipo = tipoVistoria(v);
    res.json({
      id: v.id, placa: v.placa, tipo, criadoEm: v.criadoEm,
      loja: loja?.store_name || '',
      km: tipo === 'rapida' && !v.km ? null : v.km,
      pedidoCliente: v.pedidoCliente,
      veiculo: nomeVeiculo(vei, v.veiculo),
      combustivel: v.combustivel,
      luzesPainel: lista(v.luzesPainel),
      avarias: lista(v.avarias),
      avariasDescricao: v.avariasDescricao,
      pneus: objeto(v.pneus),
      itens: lista(v.itens),
      observacoes: v.observacoes,
      fotos: fotosDaVistoria(v),
    });
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
