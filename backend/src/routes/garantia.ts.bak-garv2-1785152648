import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../server';
import { requireMaster } from '../middlewares/requireModulo';

// ===== Garantia 50.000 KM =====
// Módulo "aplicativo" do painel (importado do protótipo GPPREMIUMGARANTIA50K).
// Fluxo: loja ativa a garantia pro cliente (nasce "pendente") → admin audita e
// aprova/reprova no Painel → revisões periódicas registram sulcos/problemas por pneu.
// Regras fixas: kmMaximo = kmInicial + 50000; dataExpiracao = dataInicio + 2 anos.

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

const soDigitos = (s: string) => String(s || '').replace(/\D/g, '');
const hojeStr = () => new Date().toISOString().slice(0, 10);

// Expira por DATA quem já passou dos 2 anos mas continua "em vigência" (o km só expira
// via revisão — sem isso, garantia velha de km baixo ficava "ativa" pra sempre, inflando
// KPIs, bloqueando nova garantia do veículo e entrando no sorteio). Comparação lexical de
// YYYY-MM-DD funciona. Chamada nas rotas que contam/usam garantias em vigência.
async function expirarVencidas(): Promise<void> {
  await prisma.garantia.updateMany({
    where: { status: { in: ['ativa', 'atencao'] }, dataExpiracao: { lt: hojeStr() } },
    data: { status: 'expirada' },
  });
}

// Validação real de CPF (dígitos verificadores) — mesma regra do protótipo original.
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

// Salva foto base64 (pode vir como data-URL) em public/midias/garantia/ e devolve a
// URL pública — mesmo padrão das mídias de agendamento (servido pelo express.static).
function salvarFoto(base64: string | undefined | null): string | null {
  if (!base64) return null;
  let dados = String(base64);
  let ext = 'jpg';
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dados);
  if (m && m[1] && m[2]) {
    ext = ((m[1].split('/')[1] || 'jpg').split(';')[0] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
    dados = m[2];
  }
  const buffer = Buffer.from(dados, 'base64');
  if (buffer.length === 0) return null;
  const dir = path.join(__dirname, '../../public/midias/garantia');
  fs.mkdirSync(dir, { recursive: true });
  const nome = crypto.randomUUID() + '.' + ext;
  fs.writeFileSync(path.join(dir, nome), buffer);
  return '/midias/garantia/' + nome;
}

const POSICOES = ['dianteiro_esquerdo', 'dianteiro_direito', 'traseiro_esquerdo', 'traseiro_direito', 'estepe'];

// ---------- Resumo (KPIs do Painel) ----------
router.get('/resumo', async (_req, res) => {
  try {
    await expirarVencidas();
    const [ativas, pendentes, emAnalise, atencao, total, revisoesPendentes] = await Promise.all([
      prisma.garantia.count({ where: { status: 'ativa' } }),
      prisma.garantia.count({ where: { status: 'pendente' } }),
      prisma.garantia.count({ where: { status: 'em_analise' } }),
      prisma.garantia.count({ where: { status: 'atencao' } }),
      prisma.garantia.count(),
      prisma.garantiaRevisao.count({ where: { status: 'pendente' } }),
    ]);
    res.json({ ativas, pendentes, emAnalise, atencao, total, revisoesPendentes });
  } catch (e) { erro(res, e); }
});

// ---------- Garantias ----------

// Lista completa pro Painel: cada garantia já vem com cliente, veículo e pneus
// embutidos (3 queries no total, sem N+1 — os modelos usam campos soltos, sem relation).
router.get('/garantias', async (_req, res) => {
  try {
    await expirarVencidas();
    const garantias = await prisma.garantia.findMany({ orderBy: { criadoEm: 'desc' } });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: garantias.map((g) => g.clienteId) } } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } });
    const pneus = await prisma.garantiaPneu.findMany({ where: { garantiaId: { in: garantias.map((g) => g.id) } } });
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const veiPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const pneusPorGar: Record<string, typeof pneus> = {};
    pneus.forEach((p) => { (pneusPorGar[p.garantiaId] = pneusPorGar[p.garantiaId] || []).push(p); });
    res.json(garantias.map((g) => ({
      ...g,
      cliente: cliPorId[g.clienteId] || null,
      veiculo: veiPorId[g.veiculoId] || null,
      pneus: pneusPorGar[g.id] || [],
    })));
  } catch (e) { erro(res, e); }
});

// Busca cliente por CPF (pré-preenche o formulário de Nova Garantia, como no protótipo).
router.get('/clientes/busca', async (req, res) => {
  try {
    const cpf = soDigitos(String(req.query.cpf || ''));
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido.' });
    const cliente = await prisma.garantiaCliente.findUnique({ where: { cpf } });
    if (!cliente) return res.json({ encontrado: false });
    const veiculo = await prisma.garantiaVeiculo.findFirst({ where: { clienteId: cliente.id }, orderBy: { criadoEm: 'desc' } });
    res.json({ encontrado: true, cliente, veiculo });
  } catch (e) { erro(res, e); }
});

// Ativa uma garantia nova: upsert do cliente (por CPF) e do veículo (por placa),
// cria a garantia como "pendente" (admin aprova depois no Painel) e os pneus.
router.post('/garantias', async (req, res) => {
  try {
    const b = req.body || {};
    const cli = b.cliente || {};
    const vei = b.veiculo || {};
    const pneusIn: any[] = Array.isArray(b.pneus) ? b.pneus : [];

    const cpf = soDigitos(cli.cpf);
    if (!cpfValido(cpf)) return res.status(400).json({ error: 'CPF inválido.' });
    if (!String(cli.nome || '').trim()) return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
    const placa = String(vei.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length !== 7) return res.status(400).json({ error: 'Placa inválida (7 caracteres, padrão Mercosul ou antigo).' });
    const km = Number(vei.km);
    if (!Number.isFinite(km) || km < 0) return res.status(400).json({ error: 'Quilometragem inválida.' });
    if (pneusIn.length < 1 || pneusIn.length > 5) return res.status(400).json({ error: 'Informe de 1 a 5 pneus.' });
    for (const p of pneusIn) {
      if (!POSICOES.includes(String(p.posicao))) return res.status(400).json({ error: `Posição de pneu inválida: ${p.posicao}` });
    }

    // Checa duplicidade ANTES de escrever qualquer coisa: se a placa já existe e tem
    // garantia em andamento, recusa sem ter tocado no cliente/veículo/fotos. (Antes, os
    // upserts e o salvamento das fotos rodavam primeiro — uma placa repetida ou um km
    // errado deixava dados sobrescritos e fotos órfãs no disco, e um erro de digitação
    // de placa chegava a transferir o veículo pra outro cliente silenciosamente.)
    await expirarVencidas();
    const veiculoExistente = await prisma.garantiaVeiculo.findUnique({ where: { placa } });
    if (veiculoExistente) {
      const jaTem = await prisma.garantia.findFirst({
        where: { veiculoId: veiculoExistente.id, status: { in: ['pendente', 'em_analise', 'ativa', 'atencao'] } },
      });
      if (jaTem) return res.status(400).json({ error: 'Este veículo já tem uma garantia em andamento.' });
    }

    const cliente = await prisma.garantiaCliente.upsert({
      where: { cpf },
      update: {
        nome: String(cli.nome).trim(),
        telefone: String(cli.telefone || '').trim(),
        email: String(cli.email || '').trim(),
        ...(cli.nascimento ? { nascimento: String(cli.nascimento).slice(0, 10) } : {}),
      },
      create: {
        nome: String(cli.nome).trim(),
        cpf,
        telefone: String(cli.telefone || '').trim(),
        email: String(cli.email || '').trim(),
        nascimento: String(cli.nascimento || '').slice(0, 10),
      },
    });

    const fotoUrl = salvarFoto(vei.fotoBase64);
    const fotoOdometroUrl = salvarFoto(vei.fotoOdometroBase64);
    const dadosVeiculo = {
      clienteId: cliente.id,
      marca: String(vei.marca || '').trim(),
      modelo: String(vei.modelo || '').trim(),
      ano: Number(vei.ano) || 0,
      kmAtual: km,
      ...(fotoUrl ? { fotoUrl } : {}),
      ...(fotoOdometroUrl ? { fotoOdometroUrl } : {}),
    };
    const veiculo = await prisma.garantiaVeiculo.upsert({
      where: { placa },
      update: dadosVeiculo,
      create: { placa, ...dadosVeiculo },
    });

    const inicio = hojeStr();
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 2);
    const garantia = await prisma.garantia.create({
      data: {
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        kmInicial: km,
        kmMaximo: km + 50000,
        dataInicio: inicio,
        dataExpiracao: exp.toISOString().slice(0, 10),
        criadoPorId: req.user?.sub || null,
      },
    });

    await prisma.garantiaPneu.createMany({
      data: pneusIn.map((p) => ({
        garantiaId: garantia.id,
        posicao: String(p.posicao),
        marca: String(p.marca || '').trim(),
        modelo: String(p.modelo || '').trim(),
        medida: String(p.medida || '').trim(),
        dot: soDigitos(p.dot).slice(0, 4),
        codigoSerie: String(p.codigoSerie || '').trim(),
        fotoUrl: salvarFoto(p.fotoBase64),
      })),
    });

    res.status(201).json({ id: garantia.id, status: garantia.status });
  } catch (e) { erro(res, e); }
});

// Auditoria: aprovar (→ ativa), reprovar (→ reprovada) ou cancelar. SÓ o master —
// senão o mesmo usuário de loja que ativa a garantia poderia aprová-la sozinho,
// anulando a auditoria (o gate de módulo não distingue papel).
router.post('/garantias/:id/status', requireMaster, async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['ativa', 'reprovada', 'cancelada', 'atencao'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }
    const garantia = await prisma.garantia.update({ where: { id: String(req.params.id) }, data: { status } });
    res.json(garantia);
  } catch (e) { erro(res, e); }
});

// ---------- Revisões ----------

router.get('/revisoes', async (_req, res) => {
  try {
    const revisoes = await prisma.garantiaRevisao.findMany({ orderBy: { criadoEm: 'desc' }, take: 100 });
    const garantias = await prisma.garantia.findMany({ where: { id: { in: revisoes.map((r) => r.garantiaId) } } });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: garantias.map((g) => g.clienteId) } } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } });
    const pneusRev = await prisma.garantiaRevisaoPneu.findMany({ where: { revisaoId: { in: revisoes.map((r) => r.id) } } });
    const garPorId = Object.fromEntries(garantias.map((g) => [g.id, g]));
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const veiPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const pneusPorRev: Record<string, typeof pneusRev> = {};
    pneusRev.forEach((p) => { (pneusPorRev[p.revisaoId] = pneusPorRev[p.revisaoId] || []).push(p); });
    res.json(revisoes.map((r) => {
      const g = garPorId[r.garantiaId];
      return {
        ...r,
        cliente: g ? (cliPorId[g.clienteId] || null) : null,
        veiculo: g ? (veiPorId[g.veiculoId] || null) : null,
        pneus: pneusPorRev[r.id] || [],
      };
    }));
  } catch (e) { erro(res, e); }
});

// Registra uma revisão. Checagens automáticas (regras vindas do protótipo):
// - DOT lido diferente do cadastrado no pneu → garantia marcada dotDivergente e vai
//   pra "em_analise" (admin decide);
// - qualquer sulco abaixo de 1.6mm (limite legal) → garantia vai pra "atencao";
// - o km do veículo é atualizado; passou de kmMaximo → garantia "expirada".
router.post('/revisoes', async (req, res) => {
  try {
    const b = req.body || {};
    const garantia = await prisma.garantia.findUnique({ where: { id: String(b.garantiaId || '') } });
    if (!garantia) return res.status(404).json({ error: 'Garantia não encontrada.' });
    // Só aceita revisão de garantia EM ANDAMENTO — sem isso, uma revisão numa garantia
    // reprovada/cancelada/expirada podia "ressuscitá-la" pra em_analise/expirada e voltar
    // a bloquear nova garantia pro veículo.
    if (!['pendente', 'em_analise', 'ativa', 'atencao'].includes(garantia.status)) {
      return res.status(400).json({ error: `Garantia ${garantia.status} não aceita novas revisões.` });
    }
    const km = Number(b.km);
    if (!Number.isFinite(km) || km < garantia.kmInicial) {
      return res.status(400).json({ error: `KM inválido (precisa ser ≥ ${garantia.kmInicial}, o km de ativação).` });
    }
    const pneusIn: any[] = Array.isArray(b.pneus) ? b.pneus : [];
    if (pneusIn.length === 0) return res.status(400).json({ error: 'Informe os dados de pelo menos 1 pneu.' });

    const pneusGar = await prisma.garantiaPneu.findMany({ where: { garantiaId: garantia.id } });
    const pneuPorPosicao = Object.fromEntries(pneusGar.map((p) => [p.posicao, p]));

    const fotoOdometroUrl = salvarFoto(b.fotoOdometroBase64);
    const revisao = await prisma.garantiaRevisao.create({
      data: {
        garantiaId: garantia.id,
        km,
        mecanico: String(b.mecanico || '').trim(),
        observacoes: String(b.observacoes || '').trim(),
        ...(fotoOdometroUrl ? { fotoOdometroUrl } : {}),
        criadoPorId: req.user?.sub || null,
      },
    });

    let dotDivergente = false;
    let sulcoBaixo = false;
    await prisma.garantiaRevisaoPneu.createMany({
      data: pneusIn.map((p) => {
        const posicao = String(p.posicao || '');
        const pneu = pneuPorPosicao[posicao];
        const dotLido = soDigitos(p.dotLido).slice(0, 4);
        if (dotLido && pneu?.dot && dotLido !== pneu.dot) dotDivergente = true;
        const sulcos = [Number(p.sulcoExterno) || 0, Number(p.sulcoCentral) || 0, Number(p.sulcoInterno) || 0];
        if (sulcos.some((s) => s > 0 && s < 1.6)) sulcoBaixo = true;
        return {
          revisaoId: revisao.id,
          pneuId: pneu?.id || null,
          posicao,
          sulcoExterno: sulcos[0] ?? 0,
          sulcoCentral: sulcos[1] ?? 0,
          sulcoInterno: sulcos[2] ?? 0,
          estado: String(p.estado || 'bom'),
          problemas: JSON.stringify(Array.isArray(p.problemas) ? p.problemas : []),
          dotLido,
          observacoes: String(p.observacoes || '').trim(),
          recomendacao: String(p.recomendacao || '').trim(),
        };
      }),
    });

    // Atualiza o km do veículo e aplica as consequências automáticas na garantia.
    await prisma.garantiaVeiculo.update({ where: { id: garantia.veiculoId }, data: { kmAtual: km } });
    let novoStatus = garantia.status;
    if (km >= garantia.kmMaximo) novoStatus = 'expirada';
    else if (dotDivergente) novoStatus = 'em_analise';
    else if (sulcoBaixo && garantia.status === 'ativa') novoStatus = 'atencao';
    if (novoStatus !== garantia.status || dotDivergente) {
      await prisma.garantia.update({
        where: { id: garantia.id },
        data: { status: novoStatus, ...(dotDivergente ? { dotDivergente: true } : {}) },
      });
    }

    res.status(201).json({ id: revisao.id, dotDivergente, sulcoBaixo, statusGarantia: novoStatus });
  } catch (e) { erro(res, e); }
});

// Auditoria da revisão (só master): aprovada/reprovada.
router.post('/revisoes/:id/status', requireMaster, async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['aprovada', 'reprovada'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const revisao = await prisma.garantiaRevisao.update({ where: { id: String(req.params.id) }, data: { status } });
    res.json(revisao);
  } catch (e) { erro(res, e); }
});

// ---------- Sorteio ----------

// Sorteia entre clientes com garantia ATIVA. Fisher-Yates com crypto.randomInt
// (CSPRNG, auditável) — herdado da edge function do protótipo, sem Math.random.
router.post('/sorteios', async (req, res) => {
  try {
    const titulo = String(req.body.titulo || '').trim() || `Sorteio ${hojeStr()}`;
    const quantidade = Math.max(1, Math.min(10, Number(req.body.quantidade) || 1));

    await expirarVencidas(); // não sorteia quem já passou dos 2 anos
    const ativas = await prisma.garantia.findMany({ where: { status: 'ativa' } });
    if (ativas.length === 0) return res.status(400).json({ error: 'Nenhum cliente com garantia ativa pra sortear.' });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: ativas.map((g) => g.clienteId) } } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: ativas.map((g) => g.veiculoId) } } });
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const veiPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));

    // 1 bilhete por CLIENTE (mesmo que tenha mais de uma garantia ativa).
    const vistos = new Set<string>();
    const participantes = ativas.filter((g) => {
      if (vistos.has(g.clienteId)) return false;
      vistos.add(g.clienteId);
      return true;
    });

    for (let i = participantes.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [participantes[i], participantes[j]] = [participantes[j]!, participantes[i]!];
    }
    const vencedores = participantes.slice(0, quantidade).map((g) => {
      const c = cliPorId[g.clienteId];
      const v = veiPorId[g.veiculoId];
      return { clienteId: g.clienteId, nome: c?.nome || '?', cpf: c?.cpf || '', placa: v?.placa || '' };
    });

    const sorteio = await prisma.garantiaSorteio.create({
      data: {
        titulo,
        vencedores: JSON.stringify(vencedores),
        criadoPorId: req.user?.sub || null,
      },
    });
    res.status(201).json({ id: sorteio.id, titulo, vencedores, participantes: participantes.length });
  } catch (e) { erro(res, e); }
});

router.get('/sorteios', async (_req, res) => {
  try {
    const sorteios = await prisma.garantiaSorteio.findMany({ orderBy: { criadoEm: 'desc' }, take: 50 });
    res.json(sorteios.map((s) => {
      let vencedores = [];
      try { vencedores = JSON.parse(s.vencedores); } catch { /* deixa vazio */ }
      return { ...s, vencedores };
    }));
  } catch (e) { erro(res, e); }
});

export default router;
