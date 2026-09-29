import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Jimp from 'jimp';
import { prisma } from '../server';
import { requireMaster } from '../middlewares/requireModulo';
import { ehMaster } from '../auth/modulos';
import { dispararPushDevidos } from '../workers/garantiaPush';
import { conferirSenha } from '../auth/senha';

// Dispara o envio de push AGORA em vez de esperar o próximo ciclo do worker (até 30min).
// Fire-and-forget (não trava a resposta da rota nem falha ela se o Expo cair) — o
// worker de 30min continua existindo como rede de segurança/retry.
function dispararPushAgora(): void { dispararPushDevidos().catch(() => { /* worker de 30min tenta de novo */ }); }

// ===== Garantia 50.000 KM =====
// Módulo "aplicativo" do painel (importado do protótipo GPPREMIUMGARANTIA50K).
// Fluxo: loja ativa a garantia pro cliente (nasce "pendente") → admin audita e
// aprova/reprova no Painel → revisões periódicas registram sulcos/problemas por pneu.
// Regras fixas: kmMaximo = kmInicial + 50000; dataExpiracao = dataInicio + 2 anos.

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

// Escopo por loja (hierarquia): master/admin (GP Premium) vê TUDO; qualquer outro
// usuário é uma LOJA credenciada e só enxerga/gerencia as garantias e revisões DELA.
// Lê o papel + loja ATUAIS do banco (não confia no token, que pode estar velho — mesmo
// motivo do escopoLoja do WhatsApp). Retorna { master, lojaId }.
//   master=true  → sem filtro (vê tudo);
//   master=false, lojaId="x" → filtra por lojaId "x";
//   master=false, lojaId=null → loja sem loja definida → não vê nada (usa "__sem_loja__").
async function escopoGarantia(req: any): Promise<{ master: boolean; lojaId: string | null }> {
  const uid = req.user?.sub;
  if (!uid) return { master: false, lojaId: '__sem_loja__' };
  const u = await prisma.usuario.findUnique({ where: { id: String(uid) }, select: { role: true, lojaId: true } });
  if (u && ehMaster(u.role)) return { master: true, lojaId: null };
  return { master: false, lojaId: u?.lojaId || '__sem_loja__' };
}
// Cláusula `where` do escopo pra ser espalhada nas queries de garantia (por lojaId).
const whereEscopo = (esc: { master: boolean; lojaId: string | null }) => esc.master ? {} : { lojaId: esc.lojaId };

// Só quem PODE cadastrar garantia / fazer revisão: o master (GP Premium) ou um usuário
// de uma LOJA CREDENCIADA no programa. Loja não credenciada (mesmo com o módulo) não
// pode — a revisão/cadastro é exclusivo da rede credenciada.
async function ehCredenciada(req: any): Promise<boolean> {
  const uid = req.user?.sub;
  if (!uid) return false;
  const u = await prisma.usuario.findUnique({ where: { id: String(uid) }, select: { role: true, lojaId: true } });
  if (!u) return false;
  if (ehMaster(u.role)) return true;
  if (!u.lojaId) return false;
  const loja = await prisma.loja.findUnique({ where: { id: u.lojaId }, select: { credenciadaGarantia: true } });
  return !!loja?.credenciadaGarantia;
}
const RECUSA_CREDENCIADA = 'Apenas lojas CREDENCIADAS no programa Garantia GP Premium podem cadastrar garantias e fazer revisões.';

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

// Valida a QUALIDADE de uma foto (rejeita preta/estourada/embaçada/baixa resolução) —
// o mecânico é obrigado a mandar foto nítida. Retorna null se OK, ou a mensagem de erro.
// Só valida se a foto foi enviada (obrigatoriedade em si é regra do app).
async function validarFoto(base64: any, rotulo: string): Promise<string | null> {
  if (!base64) return null;
  try {
    let dados = String(base64);
    const m = /^data:[^;]+;base64,([\s\S]*)$/.exec(dados);
    if (m && m[1]) dados = m[1];
    const buf = Buffer.from(dados, 'base64');
    const img = await Jimp.read(buf);
    const w = img.bitmap.width, h = img.bitmap.height;
    if (w < 300 || h < 300) return `A foto de "${rotulo}" está com resolução muito baixa. Tire de novo, mais nítida.`;
    // A câmera manda foto de 8-12 megapixels; escanear isso pixel a pixel (2x: brilho
    // e nitidez) é o que deixava "ativar garantia" lento — vários segundos por foto,
    // em série, x até 18 fotos numa ativação. Reduz pra ~640px ANTES de escanear: preto/
    // estourado/embaçado continuam detectáveis do mesmo jeito (é o padrão usado em
    // detecção de blur por variância de Laplaciano), só corta o número de pixels.
    if (Math.max(w, h) > 640) img.resize(w >= h ? 640 : Jimp.AUTO, w >= h ? Jimp.AUTO : 640);
    const rw = img.bitmap.width, rh = img.bitmap.height;
    // Brilho médio (0–255)
    let soma = 0, n = 0;
    img.scan(0, 0, rw, rh, function (_x, _y, idx) { soma += ((this.bitmap.data[idx] || 0) + (this.bitmap.data[idx + 1] || 0) + (this.bitmap.data[idx + 2] || 0)) / 3; n++; });
    const brilho = soma / n;
    if (brilho < 28) return `A foto de "${rotulo}" está muito escura (quase preta). Tire de novo com mais luz.`;
    if (brilho > 246) return `A foto de "${rotulo}" está estourada/branca demais. Tire de novo.`;
    // Nitidez: variância do Laplaciano no cinza. Limiar conservador (só barra foto muito
    // embaçada/lente coberta), pra não recusar foto boa à toa.
    const lap = img.clone().greyscale().convolute([[0, 1, 0], [1, -4, 1], [0, 1, 0]]);
    let s = 0, s2 = 0, c = 0;
    lap.scan(0, 0, lap.bitmap.width, lap.bitmap.height, function (_x, _y, idx) { const v = this.bitmap.data[idx] || 0; s += v; s2 += v * v; c++; });
    const varia = s2 / c - (s / c) * (s / c);
    if (varia < 8) return `A foto de "${rotulo}" está embaçada ou a lente estava coberta. Segure firme e tire de novo com foco.`;
    return null;
  } catch {
    return `Não consegui ler a foto de "${rotulo}". Tire de novo.`;
  }
}

const POSICOES = ['dianteiro_esquerdo', 'dianteiro_direito', 'traseiro_esquerdo', 'traseiro_direito', 'estepe'];
const ordenarPneus = <T extends { posicao: string }>(pneus: T[]): T[] => (
  [...pneus].sort((a, b) => POSICOES.indexOf(a.posicao) - POSICOES.indexOf(b.posicao))
);

type GarantiaNumeravel = { id: string; veiculoId: string; criadoEm: Date };
type PneuNumeravel = { id: string; garantiaId: string; posicao: string; criadoEm: Date };

// A numeracao acompanha o historico de compras do veiculo: uma nova placa comeca no
// Pneu 1, enquanto uma compra posterior para a mesma placa continua a sequencia.
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
      .forEach((g) => {
        ordenarPneus(pneusPorGarantia[g.id] || []).forEach((p) => numeros.set(p.id, numero++));
      });
  });
  return numeros;
};
const ROTULO_POSICAO: Record<string, string> = {
  dianteiro_esquerdo: 'dianteiro esquerdo', dianteiro_direito: 'dianteiro direito',
  traseiro_esquerdo: 'traseiro esquerdo', traseiro_direito: 'traseiro direito', estepe: 'estepe',
};
const rotuloPosicao = (p: string) => ROTULO_POSICAO[p] || p;

// Cancela a GARANTIA INTEIRA (revisão reprovada — manual ou automática por km fora do
// intervalo) e notifica o cliente. Usado tanto pelo auditor (POST /revisoes/:id/status)
// quanto pelo auto-reprovar do POST /revisoes.
async function reprovarGarantiaDaRevisao(garantiaId: string, mensagem: string): Promise<void> {
  const garantia = await prisma.garantia.findUnique({ where: { id: garantiaId } });
  if (!garantia || garantia.status === 'cancelada') return;
  await prisma.garantia.update({ where: { id: garantia.id }, data: { status: 'cancelada' } });
  await prisma.garantiaNotificacao.create({
    data: { clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'garantia_cancelada', agendadaPara: hojeStr(), mensagem },
  });
}

// Config do módulo (singleton). Os números do plano são configuráveis porque a planilha
// se contradiz (1 vs 2 anos; 5.000 vs 10.000 km) — default = a regra "cabeçalho" (2 anos,
// 50.000 km, revisão a cada 10.000 km, que é o que o exemplo de cálculo do plano usa).
async function getConfig() {
  const c = await prisma.garantiaConfig.findUnique({ where: { id: 'global' } });
  if (c) return c;
  return prisma.garantiaConfig.create({ data: { id: 'global' } });
}

const diasEntre = (aIso: string, bIso: string): number => {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
};
const somaDias = (iso: string, dias: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
};

// km/dia a partir da etiqueta de óleo: (kmAtual − kmNaTroca) / dias desde a troca.
// Sem etiqueta (ou dados incoerentes) → 0 (agenda por nº de dias fixo, ver agendarProximaRevisao).
function calcularKmPorDia(oleoData: string, oleoKm: number, kmAtual: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oleoData)) return 0;
  const dias = diasEntre(oleoData, hojeStr());
  const rodou = kmAtual - oleoKm;
  if (dias <= 0 || rodou <= 0) return 0;
  return rodou / dias;
}

// Agenda a notificação da PRÓXIMA revisão. Com km/dia: quantos dias faltam pra rodar mais
// `intervaloKm`. Sem km/dia (sem etiqueta): usa `diasFallback` (nº de dias da revisão
// anterior, ou 60 por padrão). Remove notificações futuras não enviadas dessa garantia
// antes (a nova projeção substitui a antiga).
async function agendarProximaRevisao(params: {
  clienteId: string; garantiaId: string; kmPorDia: number; intervaloKm: number; diasFallback: number;
}): Promise<string> {
  const { clienteId, garantiaId, kmPorDia, intervaloKm, diasFallback } = params;
  const dias = kmPorDia > 0 ? Math.max(1, Math.round(intervaloKm / kmPorDia)) : Math.max(1, diasFallback || 60);
  const agendadaPara = somaDias(hojeStr(), dias);
  await prisma.garantiaNotificacao.deleteMany({ where: { garantiaId, tipo: 'revisao_proxima', enviada: false } });
  const msg = `Olá! Não se esqueça de ficar de olho na quilometragem do seu carro e fazer a revisão de garantia dos pneus GP Premium a cada ${intervaloKm.toLocaleString('pt-BR')} km. Leve o veículo a uma loja autorizada GP Premium e faça o rodízio dos pneus GRATUITAMENTE para manter a garantia de durabilidade dos seus pneus GP Premium.`;
  await prisma.garantiaNotificacao.create({ data: { clienteId, garantiaId, tipo: 'revisao_proxima', mensagem: msg, agendadaPara } });
  return agendadaPara;
}

// ---------- Resumo (KPIs do Painel) ----------
router.get('/resumo', async (req, res) => {
  try {
    await expirarVencidas();
    const esc = await escopoGarantia(req);
    const wG = whereEscopo(esc); // filtro por lojaId nas garantias
    // Revisões e notificações da(s) garantia(s) no escopo (via lista de ids da loja).
    const idsGarantia = esc.master ? null : (await prisma.garantia.findMany({ where: wG, select: { id: true } })).map((g) => g.id);
    const wRev = esc.master ? { status: 'pendente' } : { status: 'pendente', garantiaId: { in: idsGarantia! } };
    const wNot = esc.master
      ? { enviada: false, agendadaPara: { lte: hojeStr() } }
      : { enviada: false, agendadaPara: { lte: hojeStr() }, garantiaId: { in: idsGarantia! } };
    const [ativas, pendentes, emAnalise, atencao, total, revisoesPendentes, notificacoesPendentes] = await Promise.all([
      prisma.garantia.count({ where: { ...wG, status: 'ativa' } }),
      prisma.garantia.count({ where: { ...wG, status: 'pendente' } }),
      prisma.garantia.count({ where: { ...wG, status: 'em_analise' } }),
      prisma.garantia.count({ where: { ...wG, status: 'atencao' } }),
      prisma.garantia.count({ where: wG }),
      prisma.garantiaRevisao.count({ where: wRev }),
      prisma.garantiaNotificacao.count({ where: wNot }),
    ]);
    const podeCadastrar = await ehCredenciada(req); // loja credenciada ou master
    res.json({ ativas, pendentes, emAnalise, atencao, total, revisoesPendentes, notificacoesPendentes, podeCadastrar, master: esc.master });
  } catch (e) { erro(res, e); }
});

// ---------- Garantias ----------

// Lista completa pro Painel: cada garantia já vem com cliente, veículo e pneus
// embutidos (3 queries no total, sem N+1 — os modelos usam campos soltos, sem relation).
router.get('/garantias', async (req, res) => {
  try {
    await expirarVencidas();
    const esc = await escopoGarantia(req);
    const garantias = await prisma.garantia.findMany({ where: whereEscopo(esc), orderBy: { criadoEm: 'desc' } });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: garantias.map((g) => g.clienteId) } } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } });
    const garantiasParaNumeracao = await prisma.garantia.findMany({
      where: { veiculoId: { in: garantias.map((g) => g.veiculoId) } },
      select: { id: true, veiculoId: true, criadoEm: true },
    });
    const pneus = await prisma.garantiaPneu.findMany({ where: { garantiaId: { in: garantiasParaNumeracao.map((g) => g.id) } } });
    const numerosPneus = criarMapaNumerosPneus(garantiasParaNumeracao, pneus);
    const lojaIds = [...new Set(garantias.map((g) => g.lojaId).filter(Boolean) as string[])];
    const usuarioIds = [...new Set(garantias.map((g) => g.criadoPorId).filter(Boolean) as string[])];
    const lojas = lojaIds.length ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } }) : [];
    const usuarios = usuarioIds.length ? await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nome: true } }) : [];
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, c]));
    const veiPorId = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const lojaPorId = Object.fromEntries(lojas.map((l) => [l.id, { id: l.id, nome: l.store_name }]));
    const usuarioPorId = Object.fromEntries(usuarios.map((u) => [u.id, u.nome]));
    const pneusPorGar: Record<string, typeof pneus> = {};
    pneus.forEach((p) => { (pneusPorGar[p.garantiaId] = pneusPorGar[p.garantiaId] || []).push(p); });
    res.json(garantias.map((g) => ({
      ...g,
      cliente: cliPorId[g.clienteId] || null,
      veiculo: veiPorId[g.veiculoId] || null,
      pneus: ordenarPneus(pneusPorGar[g.id] || []).map((p) => ({ ...p, numero: numerosPneus.get(p.id) || 1 })),
      lojaCadastro: g.lojaId ? (lojaPorId[g.lojaId] || null) : null,
      mecanicoCadastro: g.criadoPorId ? (usuarioPorId[g.criadoPorId] || '') : '',
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
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { clienteId: cliente.id }, orderBy: { criadoEm: 'desc' } });
    const garantiasEmAndamento = veiculos.length ? await prisma.garantia.findMany({
      where: {
        veiculoId: { in: veiculos.map((v) => v.id) },
        status: { in: ['pendente', 'em_analise', 'ativa', 'atencao'] },
      },
      select: { veiculoId: true },
    }) : [];
    const todasGarantias = veiculos.length ? await prisma.garantia.findMany({
      where: { veiculoId: { in: veiculos.map((v) => v.id) } },
      select: { id: true, veiculoId: true },
    }) : [];
    const pneusCadastrados = todasGarantias.length ? await prisma.garantiaPneu.findMany({
      where: { garantiaId: { in: todasGarantias.map((g) => g.id) } },
      select: { garantiaId: true },
    }) : [];
    const totalPorVeiculo = garantiasEmAndamento.reduce<Record<string, number>>((acc, g) => {
      acc[g.veiculoId] = (acc[g.veiculoId] || 0) + 1;
      return acc;
    }, {});
    const veiculoPorGarantia = Object.fromEntries(todasGarantias.map((g) => [g.id, g.veiculoId]));
    const pneusPorVeiculo = pneusCadastrados.reduce<Record<string, number>>((acc, p) => {
      const veiculoId = veiculoPorGarantia[p.garantiaId];
      if (veiculoId) acc[veiculoId] = (acc[veiculoId] || 0) + 1;
      return acc;
    }, {});
    const veiculosOut = veiculos.map((v) => ({
      ...v,
      garantiaEmAndamento: Boolean(totalPorVeiculo[v.id]),
      garantiasEmAndamento: totalPorVeiculo[v.id] || 0,
      proximoNumeroPneu: (pneusPorVeiculo[v.id] || 0) + 1,
    }));
    res.json({
      encontrado: true,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email,
        nascimento: cliente.nascimento,
      },
      veiculos: veiculosOut,
      veiculo: veiculosOut[0] || null,
    });
  } catch (e) { erro(res, e); }
});

// Lista os CLIENTES do app (tela Usuários → aba "Clientes do app"). Até então o painel
// não tinha como enxergar quem usa o app: o cliente vive na tabela GarantiaCliente
// (login por CPF, separado dos Usuario do painel), então ninguém conseguia ver quem já
// criou senha, quem instalou o app, nem ajudar quem esqueceu a senha.
router.get('/clientes', requireMaster, async (_req, res) => {
  try {
    const clientes = await prisma.garantiaCliente.findMany({ orderBy: { criadoEm: 'desc' }, take: 500 });
    const ids = clientes.map((c) => c.id);
    const garantias = ids.length ? await prisma.garantia.findMany({ where: { clienteId: { in: ids } }, select: { id: true, clienteId: true, status: true } }) : [];
    const porCliente: Record<string, { total: number; ativas: number }> = {};
    garantias.forEach((g) => {
      const acc = (porCliente[g.clienteId] = porCliente[g.clienteId] || { total: 0, ativas: 0 });
      acc.total += 1;
      if (g.status === 'ativa') acc.ativas += 1;
    });
    res.json(clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      telefone: c.telefone,
      email: c.email,
      criadoEm: c.criadoEm,
      // Nunca devolve a senha (nem o hash) — só o que o painel precisa saber pra ajudar.
      temSenha: !!c.senha,
      appInstalado: !!c.pushToken,
      garantias: porCliente[c.id]?.total || 0,
      garantiasAtivas: porCliente[c.id]?.ativas || 0,
    })));
  } catch (e) { erro(res, e); }
});

// Libera o cliente a criar uma senha nova (quando ele esquece). NÃO define senha aqui:
// apaga a atual, e o cliente refaz o cadastro no app com o próprio CPF — assim ninguém
// no painel fica sabendo/escolhendo a senha de um cliente.
router.post('/clientes/:id/liberar-senha', requireMaster, async (req, res) => {
  try {
    const cliente = await prisma.garantiaCliente.findUnique({ where: { id: String(req.params.id) } });
    if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado.' });
    await prisma.garantiaCliente.update({ where: { id: cliente.id }, data: { senha: '' } });
    res.json({ ok: true, nome: cliente.nome, aviso: 'O cliente pode entrar no app com o CPF e definir uma senha nova.' });
  } catch (e) { erro(res, e); }
});

// Ficha completa de um cliente: dados, garantias e revisões. Serve pro painel mostrar
// tudo sobre a pessoa numa tela só, sem caçar em vários lugares.
router.get('/clientes/:id', requireMaster, async (req, res) => {
  try {
    const c = await prisma.garantiaCliente.findUnique({ where: { id: String(req.params.id) } });
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // O schema não declara relações do Prisma aqui (clienteId/veiculoId/lojaId são
    // campos soltos), então busca cada parte e junta na mão.
    const garantias = await prisma.garantia.findMany({
      where: { clienteId: c.id },
      orderBy: { criadoEm: 'desc' },
    });
    const veiculos = garantias.length
      ? await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } })
      : [];
    const idsLoja = garantias.map((g) => g.lojaId).filter((x): x is string => !!x);
    const lojas = idsLoja.length
      ? await prisma.loja.findMany({ where: { id: { in: idsLoja } }, select: { id: true, nome: true } })
      : [];
    const vPorId: Record<string, any> = Object.fromEntries(veiculos.map((v) => [v.id, v]));
    const lPorId: Record<string, string> = Object.fromEntries(lojas.map((l) => [l.id, l.nome]));

    res.json({
      id: c.id,
      nome: c.nome,
      cpf: c.cpf,
      telefone: c.telefone,
      email: c.email,
      criadoEm: c.criadoEm,
      temSenha: !!c.senha,          // nunca devolve a senha nem o hash
      appInstalado: !!c.pushToken,
      garantias: garantias.map((g) => {
        const v = vPorId[g.veiculoId];
        return {
          id: g.id,
          status: g.status,
          criadoEm: g.criadoEm,
          loja: g.lojaId ? (lPorId[g.lojaId] || null) : null,
          placa: v?.placa || null,
          veiculo: v ? `${v.marca || ''} ${v.modelo || ''}`.trim() || null : null,
        };
      }),
    });
  } catch (e) { erro(res, e); }
});

// Corrige os dados de contato do cliente (nome escrito errado, telefone trocado).
// O CPF NÃO muda por aqui: ele é a chave de login no app e o que amarra a garantia à
// pessoa — trocar por engano transferiria a garantia pra outro CPF sem ninguém ver.
router.put('/clientes/:id', requireMaster, async (req, res) => {
  try {
    const c = await prisma.garantiaCliente.findUnique({ where: { id: String(req.params.id) } });
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const nome = String(req.body?.nome ?? c.nome).trim();
    if (!nome) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
    const telefone = req.body?.telefone === undefined ? c.telefone : String(req.body.telefone).replace(/\D/g, '');
    const email = req.body?.email === undefined ? c.email : String(req.body.email).trim();

    const atualizado = await prisma.garantiaCliente.update({
      where: { id: c.id },
      // telefone/email são String com default "" no schema (não aceitam nulo).
      data: { nome, telefone: telefone || '', email: email || '' },
    });
    res.json({ ok: true, nome: atualizado.nome });
  } catch (e) { erro(res, e); }
});

// Exclui um cliente do aplicativo. Exige a SENHA de quem está no painel: é destrutivo e
// leva junto as garantias, revisões e fotos dele — o histórico some de vez.
router.delete('/clientes/:id', requireMaster, async (req, res) => {
  try {
    const senha = String((req.body as any)?.senha || '');
    if (!senha) return res.status(400).json({ error: 'Digite sua senha do painel para confirmar.' });

    const eu = await prisma.usuario.findUnique({ where: { id: String((req as any).user?.sub || '') } });
    if (!eu || !(await conferirSenha(senha, eu.senha))) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const c = await prisma.garantiaCliente.findUnique({ where: { id: String(req.params.id) } });
    if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });

    // Apaga de dentro pra fora, respeitando as amarrações entre as tabelas.
    const garantias = await prisma.garantia.findMany({ where: { clienteId: c.id }, select: { id: true } });
    const ids = garantias.map((g) => g.id);
    if (ids.length) {
      const revs = await prisma.garantiaRevisao.findMany({ where: { garantiaId: { in: ids } }, select: { id: true } });
      const revIds = revs.map((r) => r.id);
      if (revIds.length) await prisma.garantiaRevisaoPneu.deleteMany({ where: { revisaoId: { in: revIds } } });
      await prisma.garantiaRevisao.deleteMany({ where: { garantiaId: { in: ids } } });
      await prisma.garantiaPneu.deleteMany({ where: { garantiaId: { in: ids } } });
      await prisma.garantiaNotificacao.deleteMany({ where: { garantiaId: { in: ids } } }).catch(() => {});
      await prisma.garantia.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.garantiaVeiculo.deleteMany({ where: { clienteId: c.id } }).catch(() => {});
    await prisma.garantiaCliente.delete({ where: { id: c.id } });

    console.warn(`[Garantia] Cliente EXCLUÍDO: ${c.nome} (CPF ${c.cpf}) por ${eu.nome} — ${ids.length} garantia(s) junto.`);
    res.json({ ok: true, nome: c.nome, garantiasRemovidas: ids.length });
  } catch (e) { erro(res, e); }
});

// Busca as garantias EM ANDAMENTO de uma placa — pra fazer REVISÃO. NÃO é escopada por
// loja de propósito: pela regra do plano, o cliente pode revisar em QUALQUER loja
// credenciada, então qualquer loja precisa achar o carro pela placa (mesmo que a
// garantia tenha sido vendida por outra loja).
router.get('/garantias/por-placa', async (req, res) => {
  try {
    // Só loja credenciada (ou master) pode buscar carro pra revisar — a revisão é
    // exclusiva da rede credenciada, mas QUALQUER credenciada revisa QUALQUER carro.
    if (!(await ehCredenciada(req))) return res.status(403).json({ error: RECUSA_CREDENCIADA });
    await expirarVencidas();
    const placa = String(req.query.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (placa.length !== 7) return res.status(400).json({ error: 'Placa inválida.' });
    const veiculo = await prisma.garantiaVeiculo.findUnique({ where: { placa } });
    if (!veiculo) return res.json({ encontrada: false });
    const garantias = await prisma.garantia.findMany({
      where: { veiculoId: veiculo.id, status: { in: ['pendente', 'em_analise', 'ativa', 'atencao'] } },
      orderBy: { criadoEm: 'desc' },
    });
    if (garantias.length === 0) return res.json({ encontrada: false });
    const garantiaMaisRecente = garantias[0]!;
    const cliente = await prisma.garantiaCliente.findUnique({ where: { id: garantiaMaisRecente.clienteId } });
    const todasGarantias = await prisma.garantia.findMany({
      where: { veiculoId: veiculo.id },
      select: { id: true, veiculoId: true, criadoEm: true },
    });
    const todosPneus = await prisma.garantiaPneu.findMany({ where: { garantiaId: { in: todasGarantias.map((g) => g.id) } } });
    const idsGarantiasEmAndamento = new Set(garantias.map((g) => g.id));
    const pneus = todosPneus.filter((p) => idsGarantiasEmAndamento.has(p.garantiaId));
    const numerosPneus = criarMapaNumerosPneus(todasGarantias, todosPneus);
    // Marca quais pneus JÁ passaram por alguma revisão antes — o app usa isso pra saber
    // se pede a foto da etiqueta interna (só na 1ª revisão de cada pneu) ou não.
    const idsJaRevisados = new Set(
      (await prisma.garantiaRevisaoPneu.findMany({ where: { pneuId: { in: pneus.map((p) => p.id) } }, select: { pneuId: true } }))
        .map((r) => r.pneuId)
    );
    const pneusPorGarantia: Record<string, typeof pneus> = {};
    pneus.forEach((p) => { (pneusPorGarantia[p.garantiaId] = pneusPorGarantia[p.garantiaId] || []).push(p); });
    const garantiasOut = garantias.map((g) => ({
      ...g,
      cliente,
      veiculo,
      pneus: ordenarPneus(pneusPorGarantia[g.id] || []).map((p) => ({
        ...p,
        numero: numerosPneus.get(p.id) || 1,
        jaRevisado: idsJaRevisados.has(p.id),
      })),
    }));
    // `garantia` preserva compatibilidade com versões antigas do app/painel.
    res.json({ encontrada: true, garantias: garantiasOut, garantia: garantiasOut[0] });
  } catch (e) { erro(res, e); }
});

// Ativa uma garantia nova: upsert do cliente (por CPF) e do veículo (por placa),
// cria a garantia como "pendente" (admin aprova depois no Painel) e os pneus.
router.post('/garantias', async (req, res) => {
  try {
    if (!(await ehCredenciada(req))) return res.status(403).json({ error: RECUSA_CREDENCIADA });
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
    for (const [i, p] of pneusIn.entries()) {
      if (!POSICOES.includes(String(p.posicao))) return res.status(400).json({ error: `Posição de pneu inválida: ${p.posicao}` });
      // Ativação exige as DUAS fotos de cada pneu: a do pneu em si e a da etiqueta —
      // sem isso a auditoria não tem como conferir o que foi instalado.
      if (!p.fotoLateralBase64) return res.status(400).json({ error: `Falta a foto do pneu ${i + 1} (${rotuloPosicao(p.posicao)}).` });
      if (!p.fotoBase64) return res.status(400).json({ error: `Falta a foto da etiqueta do pneu ${i + 1} (${rotuloPosicao(p.posicao)}).` });
    }
    const posicoesInformadas = pneusIn.map((p) => String(p.posicao));
    if (new Set(posicoesInformadas).size !== posicoesInformadas.length) {
      return res.status(400).json({ error: 'Cada pneu desta compra precisa ter uma posição diferente no carro.' });
    }

    // Qualidade das fotos: recusa preta/estourada/embaçada ANTES de salvar qualquer coisa.
    const errosFoto = (await Promise.all([
      validarFoto(vei.fotoBase64, 'veículo'),
      validarFoto(vei.fotoOdometroBase64, 'odômetro'),
      ...(Boolean(vei.semEtiquetaOleo) ? [] : [validarFoto(vei.etiquetaOleoBase64, 'etiqueta de óleo')]),
      ...pneusIn.map((p, i) => validarFoto(p.fotoBase64, `pneu ${i + 1} (etiqueta)`)),
      ...pneusIn.map((p, i) => validarFoto(p.fotoLateralBase64, `pneu ${i + 1} (lateral)`)),
      ...pneusIn.map((p, i) => validarFoto(p.fotoBandaBase64, `pneu ${i + 1} (banda)`)),
    ])).filter(Boolean);
    if (errosFoto.length) return res.status(400).json({ error: errosFoto[0] });

    // A mesma placa pode receber outra compra/garantia. Só bloqueamos quando a placa já
    // pertence a OUTRO CPF, evitando transferir o veículo silenciosamente entre clientes.
    await expirarVencidas();
    const veiculoExistente = await prisma.garantiaVeiculo.findUnique({ where: { placa } });
    if (veiculoExistente) {
      const donoAtual = await prisma.garantiaCliente.findUnique({ where: { id: veiculoExistente.clienteId }, select: { cpf: true } });
      if (donoAtual && donoAtual.cpf !== cpf) {
        return res.status(400).json({ error: 'Esta placa já está cadastrada para outro CPF.' });
      }
    }

    const cfg = await getConfig();

    // Etiqueta de óleo → base do cálculo de km/dia (motor de notificação). Só usa se
    // o operador NÃO marcou "sem etiqueta" e os dados forem coerentes.
    const semEtiquetaOleo = Boolean(vei.semEtiquetaOleo);
    const oleoData = /^\d{4}-\d{2}-\d{2}$/.test(String(vei.oleoData || '')) ? String(vei.oleoData) : '';
    const oleoKm = Number(vei.oleoKm) || 0;
    // km que a PRÓPRIA ETIQUETA indica pra próxima troca (lido do adesivo) — informativo,
    // não entra no cálculo de kmPorDia (que já usa oleoData+oleoKm+km atual).
    const oleoProximaTrocaKm = Number(vei.oleoProximaTrocaKm) || null;
    const kmPorDia = semEtiquetaOleo ? 0 : calcularKmPorDia(oleoData, oleoKm, km);

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
    const etiquetaOleoUrl = salvarFoto(vei.etiquetaOleoBase64);
    const dadosVeiculo = {
      clienteId: cliente.id,
      marca: String(vei.marca || '').trim(),
      modelo: String(vei.modelo || '').trim(),
      ano: Number(vei.ano) || 0,
      kmAtual: km,
      oleoData: semEtiquetaOleo ? '' : oleoData,
      oleoKm: semEtiquetaOleo ? 0 : oleoKm,
      oleoProximaTrocaKm: semEtiquetaOleo ? null : oleoProximaTrocaKm,
      semEtiquetaOleo,
      kmPorDia,
      ...(fotoUrl ? { fotoUrl } : {}),
      ...(fotoOdometroUrl ? { fotoOdometroUrl } : {}),
      ...(etiquetaOleoUrl ? { etiquetaOleoUrl } : {}),
    };
    const veiculo = await prisma.garantiaVeiculo.upsert({
      where: { placa },
      update: dadosVeiculo,
      create: { placa, ...dadosVeiculo },
    });

    // Carimba a LOJA de quem ativou (escopo): a garantia "pertence" à loja do usuário.
    const criador = req.user?.sub ? await prisma.usuario.findUnique({ where: { id: String(req.user.sub) }, select: { lojaId: true } }) : null;
    const inicio = hojeStr();
    const exp = new Date();
    exp.setMonth(exp.getMonth() + cfg.garantiaMeses);
    const garantia = await prisma.garantia.create({
      data: {
        clienteId: cliente.id,
        veiculoId: veiculo.id,
        kmInicial: km,
        kmMaximo: km + cfg.garantiaKm,
        dataInicio: inicio,
        dataExpiracao: exp.toISOString().slice(0, 10),
        cadastroOleoData: semEtiquetaOleo ? '' : oleoData,
        cadastroOleoKm: semEtiquetaOleo ? 0 : oleoKm,
        cadastroFotoVeiculoUrl: fotoUrl,
        cadastroFotoOdometroUrl: fotoOdometroUrl,
        cadastroEtiquetaOleoUrl: etiquetaOleoUrl,
        criadoPorId: req.user?.sub || null,
        lojaId: criador?.lojaId || null,
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
        etiquetaNumero: String(p.etiquetaNumero || '').trim(),
        fotoUrl: salvarFoto(p.fotoBase64),
        fotoLateralUrl: salvarFoto(p.fotoLateralBase64),
        fotoBandaUrl: salvarFoto(p.fotoBandaBase64),
      })),
    });

    // Agenda a 1ª notificação de revisão (a cada intervaloRevisaoKm). Sem km/dia
    // (sem etiqueta) cai no fallback de 60 dias.
    const agendadaPara = await agendarProximaRevisao({
      clienteId: cliente.id, garantiaId: garantia.id, kmPorDia, intervaloKm: cfg.intervaloRevisaoKm, diasFallback: 60,
    });

    res.status(201).json({ id: garantia.id, status: garantia.status, kmPorDia, proximaRevisaoEm: agendadaPara });
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
    const anterior = await prisma.garantia.findUnique({ where: { id: String(req.params.id) } });
    const garantia = await prisma.garantia.update({ where: { id: String(req.params.id) }, data: { status } });

    // Notifica o cliente numa mudança que FAZ SENTIDO pra ele (aprovação ou negativa),
    // não em toda troca de status silenciosa (ex.: nada muda se já estava no mesmo status).
    if (anterior && anterior.status !== status) {
      if (status === 'ativa') {
        await prisma.garantiaNotificacao.create({
          data: {
            clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'garantia_aprovada', agendadaPara: hojeStr(),
            mensagem: `Sua garantia GP Premium foi aprovada! Cobertura até ${garantia.kmMaximo.toLocaleString('pt-BR')} km.`,
          },
        });
      } else if (status === 'reprovada' || status === 'cancelada') {
        await prisma.garantiaNotificacao.create({
          data: {
            clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'garantia_cancelada', agendadaPara: hojeStr(),
            mensagem: status === 'reprovada'
              ? 'Sua solicitação de garantia GP Premium não foi aprovada na auditoria. Procure uma loja credenciada para mais informações.'
              : 'Sua garantia GP Premium foi cancelada. Procure uma loja credenciada para mais informações.',
          },
        });
      }
    }
    dispararPushAgora();
    res.json(garantia);
  } catch (e) { erro(res, e); }
});

// ---------- Revisões ----------

router.get('/revisoes', async (req, res) => {
  try {
    // Loja vê as revisões que ELA fez (revisao.lojaId); master vê todas. Filtro opcional
    // por criadoPorId — histórico de UM mecânico específico (conta própria, não texto
    // livre) — usado pelo painel na ficha do mecânico.
    const esc = await escopoGarantia(req);
    const where: any = whereEscopo(esc);
    if (req.query.criadoPorId) where.criadoPorId = String(req.query.criadoPorId);
    const revisoes = await prisma.garantiaRevisao.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 100 });
    const garantias = await prisma.garantia.findMany({ where: { id: { in: revisoes.map((r) => r.garantiaId) } } });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: garantias.map((g) => g.clienteId) } } });
    const veiculos = await prisma.garantiaVeiculo.findMany({ where: { id: { in: garantias.map((g) => g.veiculoId) } } });
    const pneusRev = await prisma.garantiaRevisaoPneu.findMany({ where: { revisaoId: { in: revisoes.map((r) => r.id) } } });
    // Loja que FEZ cada revisão (pode diferir da que vendeu) — pro painel mostrar onde foi feita.
    const lojaIds = [...new Set(revisoes.map((r) => r.lojaId).filter(Boolean) as string[])];
    const lojas = lojaIds.length ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } }) : [];
    const lojaPorId = Object.fromEntries(lojas.map((l) => [l.id, { id: l.id, nome: l.store_name }]));
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
        loja: r.lojaId ? (lojaPorId[r.lojaId] || null) : null,
        pneus: pneusPorRev[r.id] || [],
      };
    }));
  } catch (e) { erro(res, e); }
});

// Registra uma revisão. Checagens automáticas (regras do plano):
// - odômetro andou pra trás (km < km da revisão/ativação anterior) → suspeito de
//   adulteração → alerta pro analista (notificação odometro_suspeito) + em_analise;
// - DOT lido diferente do cadastrado → dotDivergente + em_analise;
// - flag "arrancamento de borracha" num pneu → cancela a garantia DAQUELE pneu
//   (não aceita mais revisão nele) + notifica o cliente;
// - sulco abaixo de 1.6mm → garantia vai pra "atencao";
// - km do veículo atualizado; passou de kmMaximo → "expirada";
// - recalcula km/dia e reagenda a próxima notificação de revisão.
router.post('/revisoes', async (req, res) => {
  try {
    if (!(await ehCredenciada(req))) return res.status(403).json({ error: RECUSA_CREDENCIADA });
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

    const veiculo = await prisma.garantiaVeiculo.findUnique({ where: { id: garantia.veiculoId } });
    const garantiasDoVeiculo = await prisma.garantia.findMany({
      where: { veiculoId: garantia.veiculoId },
      select: { id: true, veiculoId: true, criadoEm: true },
    });
    const todosPneusDoVeiculo = await prisma.garantiaPneu.findMany({
      where: { garantiaId: { in: garantiasDoVeiculo.map((g) => g.id) } },
    });
    const numerosPneus = criarMapaNumerosPneus(garantiasDoVeiculo, todosPneusDoVeiculo);
    const pneusGar = ordenarPneus(todosPneusDoVeiculo.filter((p) => p.garantiaId === garantia.id));
    const pneuPorPosicao = Object.fromEntries(pneusGar.map((p) => [p.posicao, p]));
    // "1ª revisão desse pneu": nunca apareceu antes em nenhum GarantiaRevisaoPneu. O pneu
    // não muda de identidade entre revisões, então só pede a etiqueta interna uma vez.
    const idsJaRevisados = new Set(
      (await prisma.garantiaRevisaoPneu.findMany({ where: { pneuId: { in: pneusGar.map((p) => p.id) } }, select: { pneuId: true } }))
        .map((r) => r.pneuId)
    );
    // Pneu sem correspondência por posição (não deveria acontecer, mas por segurança)
    // é tratado como 1ª revisão — não dá pra provar que já foi documentado antes.
    const ehPrimeiraRevisaoDoPneu = (posicao: string) => {
      const pneu = pneuPorPosicao[posicao];
      return !pneu || !idsJaRevisados.has(pneu.id);
    };

    // Obrigatoriedades (regra do plano): quem revisou, o checklist de problemas marcado
    // e as fotos comprobatórias. TODA revisão de cada pneu exige DOT + banda (ombro
    // direito e esquerdo, com o profundímetro no pneu); a etiqueta INTERNA só na 1ª
    // revisão daquele pneu específico.
    if (!String(b.mecanico || '').trim()) return res.status(400).json({ error: 'Informe o nome do mecânico responsável (obrigatório).' });
    if (!b.fotoOdometroBase64) return res.status(400).json({ error: 'A foto do odômetro é obrigatória.' });
    // Etiqueta de óleo em TODA revisão (igual na ativação) — é essa data/km que vira a
    // NOVA referência pra calcular km/dia e agendar a próxima notificação (antes disso a
    // revisão nunca atualizava, e o cálculo ficava usando pra sempre a etiqueta da
    // ativação, mesmo anos depois). Só dispensa quem já nasceu sem etiqueta.
    const semEtiquetaOleo = Boolean(veiculo?.semEtiquetaOleo);
    if (!semEtiquetaOleo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.oleoData || ''))) return res.status(400).json({ error: 'Informe a data da etiqueta de óleo (obrigatória).' });
      if (!Number.isFinite(Number(b.oleoKm)) || Number(b.oleoKm) <= 0) return res.status(400).json({ error: 'Informe o km da etiqueta de óleo (obrigatório).' });
      if (!b.etiquetaOleoBase64) return res.status(400).json({ error: 'A foto da etiqueta de óleo é obrigatória.' });
    }
    const CAMPOS_SEMPRE = [
      { campo: 'fotoDotBase64', rotulo: 'DOT junto com o pneu' },
      { campo: 'fotoBandaDireitaBase64', rotulo: 'banda de rodagem — ombro direito, com o profundímetro' },
      { campo: 'fotoBandaEsquerdaBase64', rotulo: 'banda de rodagem — ombro esquerdo, com o profundímetro' },
    ];
    for (let i = 0; i < pneusIn.length; i++) {
      const p = pneusIn[i];
      const posicao = String(p.posicao || '');
      const pneu = pneuPorPosicao[posicao];
      const numeroPneu = pneu ? (numerosPneus.get(pneu.id) || i + 1) : i + 1;
      const primeira = ehPrimeiraRevisaoDoPneu(posicao);
      if (!Array.isArray(p.problemas) || p.problemas.length === 0) {
        return res.status(400).json({ error: `Marque o checklist de problemas do Pneu ${numeroPneu} (use "Nenhum problema encontrado" se estiver tudo certo).` });
      }
      if (soDigitos(p.dotLido).length !== 4) {
        return res.status(400).json({ error: `Digite os 4 dígitos do DOT do Pneu ${numeroPneu} (além da foto).` });
      }
      if (primeira && !p.fotoEtiquetaInternaBase64) {
        return res.status(400).json({ error: `Falta a foto da etiqueta interna do Pneu ${numeroPneu} — é a 1ª revisão desse pneu, ela é obrigatória.` });
      }
      for (const f of CAMPOS_SEMPRE) {
        if (!p[f.campo]) return res.status(400).json({ error: `Falta a foto "${f.rotulo}" do Pneu ${numeroPneu}.` });
      }
    }

    // Qualidade de TODAS as fotos (recusa preta/embaçada/pequena antes de salvar).
    const errosFotoRev = (await Promise.all([
      validarFoto(b.fotoOdometroBase64, 'odômetro'),
      validarFoto(b.etiquetaOleoBase64, 'etiqueta de óleo'),
      ...pneusIn.flatMap((p, i) => [
        validarFoto(p.fotoEtiquetaInternaBase64, `pneu ${i + 1} (etiqueta interna)`),
        ...CAMPOS_SEMPRE.map((f) => validarFoto(p[f.campo], `pneu ${i + 1} (${f.rotulo})`)),
      ]),
    ])).filter(Boolean);
    if (errosFotoRev.length) return res.status(400).json({ error: errosFotoRev[0] });

    const cfg = await getConfig();

    // Odômetro suspeito: km menor que o maior km já registrado (última revisão ou ativação).
    const ultimaRev = await prisma.garantiaRevisao.findFirst({ where: { garantiaId: garantia.id }, orderBy: { km: 'desc' } });
    const maiorKmAnterior = Math.max(garantia.kmInicial, ultimaRev?.km || 0);
    const odometroSuspeito = km < maiorKmAnterior;

    // KM esperado = km da última revisão (ou da ativação) + intervalo configurado. Se a
    // revisão registrada fugir mais de 10% desse valor (pra mais OU pra menos), reprova
    // automaticamente — sem esperar o master auditar.
    const kmEsperado = maiorKmAnterior + cfg.intervaloRevisaoKm;
    const diffPctEsperado = kmEsperado > 0 ? (Math.abs(km - kmEsperado) / kmEsperado) * 100 : 0;
    const foraDoIntervalo = diffPctEsperado > 10;

    // Carimba a LOJA que fez a revisão (pode ser diferente da que vendeu — revisão
    // pode ser feita em qualquer loja credenciada).
    const revisor = req.user?.sub ? await prisma.usuario.findUnique({ where: { id: String(req.user.sub) }, select: { lojaId: true } }) : null;
    const fotoOdometroUrl = salvarFoto(b.fotoOdometroBase64);
    const etiquetaOleoUrl = salvarFoto(b.etiquetaOleoBase64);
    const revisao = await prisma.garantiaRevisao.create({
      data: {
        garantiaId: garantia.id,
        km,
        kmEsperado,
        status: foraDoIntervalo ? 'reprovada' : 'pendente',
        mecanico: String(b.mecanico || '').trim(),
        observacoes: String(b.observacoes || '').trim(),
        oleoData: semEtiquetaOleo ? '' : String(b.oleoData),
        oleoKm: semEtiquetaOleo ? 0 : Number(b.oleoKm),
        odometroSuspeito,
        ...(fotoOdometroUrl ? { fotoOdometroUrl } : {}),
        ...(etiquetaOleoUrl ? { etiquetaOleoUrl } : {}),
        criadoPorId: req.user?.sub || null,
        lojaId: revisor?.lojaId || null,
      },
    });

    let dotDivergente = false;
    let sulcoBaixo = false;
    const pneusCancelados: { id: string; posicao: string; numero: number }[] = [];
    await prisma.garantiaRevisaoPneu.createMany({
      data: pneusIn.map((p) => {
        const posicao = String(p.posicao || '');
        const pneu = pneuPorPosicao[posicao];
        const dotLido = soDigitos(p.dotLido).slice(0, 4);
        if (dotLido && pneu?.dot && dotLido !== pneu.dot) dotDivergente = true;
        const prof = Number(p.profundidadeSulco) || 0;
        const sulcos = [Number(p.sulcoExterno) || 0, Number(p.sulcoCentral) || 0, Number(p.sulcoInterno) || 0];
        const menorSulco = [prof, ...sulcos].filter((s) => s > 0).sort((a, c) => a - c)[0] || 0;
        if (menorSulco > 0 && menorSulco < 1.6) sulcoBaixo = true;
        const arrancamento = Boolean(p.arrancamentoBorracha);
        // Só cancela um pneu que ainda tem garantia (evita recancelar/renotificar).
        if (arrancamento && pneu && !pneu.cancelada) {
          pneusCancelados.push({ id: pneu.id, posicao, numero: numerosPneus.get(pneu.id) || 1 });
        }
        return {
          revisaoId: revisao.id,
          pneuId: pneu?.id || null,
          posicao,
          profundidadeSulco: prof,
          sulcoExterno: sulcos[0] ?? 0,
          sulcoCentral: sulcos[1] ?? 0,
          sulcoInterno: sulcos[2] ?? 0,
          estado: String(p.estado || 'bom'),
          arrancamentoBorracha: arrancamento,
          problemas: JSON.stringify(Array.isArray(p.problemas) ? p.problemas : []),
          dotLido,
          observacoes: String(p.observacoes || '').trim(),
          recomendacao: String(p.recomendacao || '').trim(),
          fotoEtiquetaInternaUrl: salvarFoto(p.fotoEtiquetaInternaBase64),
          fotoDotUrl: salvarFoto(p.fotoDotBase64),
          fotoBandaDireitaUrl: salvarFoto(p.fotoBandaDireitaBase64),
          fotoBandaEsquerdaUrl: salvarFoto(p.fotoBandaEsquerdaBase64),
        };
      }),
    });

    // Arrancamento de borracha → cancela a garantia DAQUELE pneu + notifica o cliente.
    for (const pc of pneusCancelados) {
      await prisma.garantiaPneu.update({
        where: { id: pc.id },
        data: { cancelada: true, canceladaMotivo: 'Arrancamento de borracha detectado na revisão', canceladaEm: new Date() },
      });
      await prisma.garantiaNotificacao.create({
        data: {
          clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'pneu_cancelado', agendadaPara: hojeStr(),
          mensagem: `Atenção: identificamos na revisão marcas de arrancamento de borracha no Pneu ${pc.numero}. Conforme o termo de garantia GP Premium, a garantia de durabilidade DESTE pneu foi cancelada.`,
        },
      });
    }
    // Odômetro suspeito → notificação pro analista (aparece no painel).
    if (odometroSuspeito) {
      await prisma.garantiaNotificacao.create({
        data: {
          clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'odometro_suspeito', agendadaPara: hojeStr(),
          mensagem: `Odômetro suspeito na revisão do veículo ${veiculo?.placa || ''}: km informado (${km.toLocaleString('pt-BR')}) é menor que o já registrado (${maiorKmAnterior.toLocaleString('pt-BR')}). Verificar possível adulteração.`,
        },
      });
    }

    // Atualiza km + recalcula km/dia a partir da etiqueta de óleo LIDA NESTA revisão (não
    // mais a da ativação parada no tempo) — essa passa a ser a referência pra próxima
    // revisão também, até a etiqueta trocar de novo.
    const novaOleoData = semEtiquetaOleo ? '' : String(b.oleoData);
    const novaOleoKm = semEtiquetaOleo ? 0 : Number(b.oleoKm);
    const novaOleoProximaTrocaKm = semEtiquetaOleo ? null : (Number(b.oleoProximaTrocaKm) || null);
    const kmPorDia = semEtiquetaOleo ? 0 : calcularKmPorDia(novaOleoData, novaOleoKm, km);
    await prisma.garantiaVeiculo.update({
      where: { id: garantia.veiculoId },
      data: {
        kmAtual: km, kmPorDia,
        ...(semEtiquetaOleo ? {} : { oleoData: novaOleoData, oleoKm: novaOleoKm, oleoProximaTrocaKm: novaOleoProximaTrocaKm }),
        // Mesmo arquivo já salvo acima pro registro da GarantiaRevisao — reaproveita a
        // URL em vez de gravar o arquivo de novo no disco.
        ...(etiquetaOleoUrl ? { etiquetaOleoUrl } : {}),
      },
    });

    let novoStatus = garantia.status;
    if (foraDoIntervalo) {
      // KM muito fora do esperado (>10% de diferença) → reprova na hora, sem esperar
      // o master auditar. Cancela a garantia inteira e avisa o cliente.
      novoStatus = 'cancelada';
      await reprovarGarantiaDaRevisao(
        garantia.id,
        `Sua garantia GP Premium foi cancelada: a quilometragem desta revisão (${km.toLocaleString('pt-BR')} km) ficou muito diferente da esperada (${kmEsperado.toLocaleString('pt-BR')} km) — mais de 10% de diferença do intervalo de ${cfg.intervaloRevisaoKm.toLocaleString('pt-BR')} km entre revisões.`,
      );
      // Cancelada: limpa qualquer lembrete de revisão futuro que ainda não foi enviado.
      await prisma.garantiaNotificacao.deleteMany({ where: { garantiaId: garantia.id, tipo: 'revisao_proxima', enviada: false } });
    } else {
      // Novo status. Fraude (DOT divergente / odômetro suspeito) VENCE o "expirada": é
      // mais acionável mandar pra análise do que deixar expirar limpo escondendo a
      // divergência. Depois vem o limite de km, depois sulco baixo.
      if (dotDivergente || odometroSuspeito) novoStatus = 'em_analise';
      else if (km >= garantia.kmMaximo) novoStatus = 'expirada';
      else if (sulcoBaixo && garantia.status === 'ativa') novoStatus = 'atencao';
      if (novoStatus !== garantia.status || dotDivergente) {
        await prisma.garantia.update({
          where: { id: garantia.id },
          data: { status: novoStatus, ...(dotDivergente ? { dotDivergente: true } : {}) },
        });
      }

      // Reagenda a próxima notificação de revisão — SÓ se a garantia continua em vigência.
      // Se expirou (km), não faz sentido mandar o cliente a uma revisão que o sistema vai
      // recusar. Sem etiqueta: mesmo nº de dias da revisão anterior, fallback 60 dias.
      if (novoStatus !== 'expirada') {
        const diasFallback = ultimaRev ? Math.max(1, diasEntre(ultimaRev.criadoEm.toISOString().slice(0, 10), hojeStr())) : 60;
        await agendarProximaRevisao({
          clienteId: garantia.clienteId, garantiaId: garantia.id, kmPorDia, intervaloKm: cfg.intervaloRevisaoKm, diasFallback,
        });
      } else {
        await prisma.garantiaNotificacao.deleteMany({ where: { garantiaId: garantia.id, tipo: 'revisao_proxima', enviada: false } });
      }
    }

    dispararPushAgora();
    res.status(201).json({
      id: revisao.id, dotDivergente, sulcoBaixo, odometroSuspeito,
      pneusCancelados: pneusCancelados.map((p) => `Pneu ${p.numero}`),
      statusGarantia: novoStatus, kmPorDia,
      foraDoIntervalo, kmEsperado, diffPctEsperado: Math.round(diffPctEsperado),
    });
  } catch (e) { erro(res, e); }
});

// Auditoria da revisão (só master): aprovada/reprovada.
router.post('/revisoes/:id/status', requireMaster, async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['aprovada', 'reprovada'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const revisao = await prisma.garantiaRevisao.update({ where: { id: String(req.params.id) }, data: { status } });

    if (status === 'reprovada') {
      // Revisão REPROVADA cancela a garantia INTEIRA (regra do plano: revisão negada na
      // auditoria = garantia negada ao cliente) e avisa o cliente pelo app.
      await reprovarGarantiaDaRevisao(revisao.garantiaId, 'Sua garantia GP Premium foi cancelada: a revisão registrada não foi aprovada na auditoria. Procure uma loja credenciada para mais informações.');
    } else {
      // Revisão APROVADA — avisa o cliente que passou na auditoria (fecha o loop:
      // ele já é avisado quando é reprovada, faz sentido avisar quando aprova também).
      const garantia = await prisma.garantia.findUnique({ where: { id: revisao.garantiaId } });
      if (garantia) {
        await prisma.garantiaNotificacao.create({
          data: {
            clienteId: garantia.clienteId, garantiaId: garantia.id, tipo: 'revisao_aprovada', agendadaPara: hojeStr(),
            mensagem: `Sua revisão de ${revisao.km.toLocaleString('pt-BR')} km foi aprovada! Sua garantia GP Premium continua em dia.`,
          },
        });
      }
    }
    dispararPushAgora();
    res.json(revisao);
  } catch (e) { erro(res, e); }
});

// ---------- Config (números do plano, ajustáveis pelo master) ----------
router.get('/config', async (_req, res) => {
  try { res.json(await getConfig()); } catch (e) { erro(res, e); }
});
router.post('/config', requireMaster, async (req, res) => {
  try {
    const b = req.body || {};
    const garantiaMeses = Math.max(1, Math.min(120, Number(b.garantiaMeses) || 24));
    const garantiaKm = Math.max(1000, Math.min(500000, Number(b.garantiaKm) || 50000));
    const intervaloRevisaoKm = Math.max(500, Math.min(100000, Number(b.intervaloRevisaoKm) || 10000));
    const cfg = await prisma.garantiaConfig.upsert({
      where: { id: 'global' },
      update: { garantiaMeses, garantiaKm, intervaloRevisaoKm },
      create: { id: 'global', garantiaMeses, garantiaKm, intervaloRevisaoKm },
    });
    res.json(cfg);
  } catch (e) { erro(res, e); }
});

// ---------- Notificações (motor de km/dia) ----------
// Pendentes = já venceu o dia agendado e ainda não foi enviada. O painel mostra pra
// envio MANUAL (mesma filosofia do Disparo — nada sai sozinho, pra não arriscar bloqueio).
router.get('/notificacoes', async (req, res) => {
  try {
    const esc = await escopoGarantia(req);
    // Sempre devolve o histórico completo, inclusive futuras. Clientes com o painel
    // antigo ainda chamam ?pendentes=1; ignorar esse filtro faz a agenda aparecer sem
    // depender de limpar o cache do navegador.
    const where: any = {};
    // Loja só vê notificações das garantias dela.
    if (!esc.master) {
      const ids = (await prisma.garantia.findMany({ where: whereEscopo(esc), select: { id: true } })).map((g) => g.id);
      where.garantiaId = { in: ids };
    }
    const notifs = await prisma.garantiaNotificacao.findMany({ where, orderBy: { agendadaPara: 'asc' }, take: 200 });
    const clientes = await prisma.garantiaCliente.findMany({ where: { id: { in: notifs.map((n) => n.clienteId) } } });
    const garantiaIds = [...new Set(notifs.map((n) => n.garantiaId).filter(Boolean))];
    const garantiasNotif = garantiaIds.length
      ? await prisma.garantia.findMany({ where: { id: { in: garantiaIds } }, select: { id: true, veiculoId: true } })
      : [];
    const veiculoIds = [...new Set(garantiasNotif.map((g) => g.veiculoId))];
    const veiculosNotif = veiculoIds.length
      ? await prisma.garantiaVeiculo.findMany({ where: { id: { in: veiculoIds } }, select: { id: true, placa: true, marca: true, modelo: true } })
      : [];
    const veiculoPorId = Object.fromEntries(veiculosNotif.map((v) => [v.id, v]));
    const veiculoPorGarantia = Object.fromEntries(garantiasNotif.map((g) => [g.id, veiculoPorId[g.veiculoId] || null]));
    const cliPorId = Object.fromEntries(clientes.map((c) => [c.id, {
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      appInstalado: Boolean(c.pushToken),
    }]));
    res.json(notifs.map((n) => ({
      ...n,
      cliente: cliPorId[n.clienteId] || null,
      veiculo: veiculoPorGarantia[n.garantiaId] || null,
    })));
  } catch (e) { erro(res, e); }
});
router.post('/notificacoes/:id/enviada', async (req, res) => {
  try {
    const n = await prisma.garantiaNotificacao.update({ where: { id: String(req.params.id) }, data: { enviada: true, enviadaEm: new Date() } });
    res.json(n);
  } catch (e) { erro(res, e); }
});

// Disparo MANUAL de notificação (master): você escreve a mensagem e escolhe quem recebe
// (um cliente pelo CPF, ou TODOS). Cai na lista do app do cliente e — pro cliente com
// push registrado — chega na tela do celular na hora (dispararPushAgora abaixo).
router.post('/notificacoes/manual', requireMaster, async (req, res) => {
  try {
    const b = req.body || {};
    const mensagem = String(b.mensagem || '').trim();
    if (!mensagem) return res.status(400).json({ error: 'Escreva a mensagem.' });
    let clientes: { id: string }[] = [];
    if (b.alvo === 'todos') {
      clientes = await prisma.garantiaCliente.findMany({ select: { id: true } });
    } else if (b.cpf) {
      const c = await prisma.garantiaCliente.findUnique({ where: { cpf: soDigitos(b.cpf) }, select: { id: true } });
      if (c) clientes = [c];
    }
    if (!clientes.length) return res.status(404).json({ error: 'Nenhum cliente encontrado pra esse alvo.' });
    await prisma.garantiaNotificacao.createMany({
      data: clientes.map((c) => ({ clienteId: c.id, garantiaId: '', tipo: 'aviso', mensagem, agendadaPara: hojeStr(), enviada: false })),
    });
    dispararPushAgora();
    res.status(201).json({ ok: true, total: clientes.length });
  } catch (e) { erro(res, e); }
});

// ---------- Sorteio ----------

// Sorteia entre clientes com garantia ATIVA. Fisher-Yates com crypto.randomInt
// (CSPRNG, auditável) — herdado da edge function do protótipo, sem Math.random.
// SÓ master (GP Premium) — sorteio é ação da marca, não da loja.
router.post('/sorteios', requireMaster, async (req, res) => {
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

// ---------- Vistoria de entrada (app do mecânico) ----------
// Registro de como o carro CHEGOU na oficina (km, painel, fotos, avarias, pneus, itens).
// Vale pra QUALQUER carro, com ou sem Garantia 50k — por isso NÃO exige loja credenciada:
// basta ter o módulo (o mount já garante) e ser master OU ter loja. Escopo igual ao das
// garantias: master vê todas; loja só as dela. O cliente final não vê vistoria nenhuma.

const PLACA_VISTORIA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/; // ABC1D23 (Mercosul) ou ABC1234
// Corta ANTES de normalizar: placa gigante no corpo não vira cópia de MB na memória.
const normalizarPlaca = (v: any) => String(v ?? '').slice(0, 32).toUpperCase().replace(/[^A-Z0-9]/g, '');
const GARANTIA_EM_ANDAMENTO = ['pendente', 'em_analise', 'ativa', 'atencao'];
// Chaves IGUAIS no app e no painel (contrato §3). Posições de pneu = POSICOES lá de cima.
const VISTORIA_COMBUSTIVEL = ['reserva', '1/4', '1/2', '3/4', 'cheio'];
const VISTORIA_LUZES = ['nenhuma', 'injecao', 'oleo', 'bateria', 'freio_abs', 'airbag', 'temperatura', 'outra'];
const VISTORIA_AVARIAS = ['nenhuma', 'risco', 'amassado', 'vidro_trincado', 'farol_lanterna', 'retrovisor', 'outra'];
const VISTORIA_ESTADOS_PNEU = ['bom', 'gasto', 'avariado'];
const VISTORIA_ITENS = ['estepe', 'macaco', 'chave_roda', 'triangulo', 'documento', 'som', 'tapetes'];
// As 6 fotos obrigatórias. Rótulo pensado pra ler bem em "Falta a foto do <rótulo>." e
// nas mensagens do validarFoto ('A foto de "<rótulo>" está muito escura...').
const FOTOS_VISTORIA = [
  { campo: 'fotoOdometroBase64', rotulo: 'odômetro' },
  { campo: 'fotoPainelBase64', rotulo: 'painel' },
  { campo: 'fotoFrenteBase64', rotulo: 'carro (frente)' },
  { campo: 'fotoTraseiraBase64', rotulo: 'carro (traseira)' },
  { campo: 'fotoLadoEsquerdoBase64', rotulo: 'carro (lado esquerdo)' },
  { campo: 'fotoLadoDireitoBase64', rotulo: 'carro (lado direito)' },
];
const MAX_FOTOS_AVARIA = 6;

// Erro de validação do corpo da vistoria → vira 400 com a mensagem.
class ErroVistoria extends Error {}

// Texto livre: aceita string/número, tira espaços e corta no máximo (por caractere, sem
// partir emoji no meio). Corta em max*2 unidades ANTES do Array.from (texto de 20 MB no
// corpo virava uma lista de 20 milhões de caracteres na memória do CRM) — max*2 sempre
// cobre max caracteres, mesmo só de emoji. Tira o caractere nulo (\u0000) e meio emoji solto
// (surrogate sem par, ex. "\ud800"), que o banco recusa (virava erro 500 depois de gravar as
// fotos).
const textoVistoria = (v: any, max: number): string => (
  typeof v === 'string' || typeof v === 'number'
    ? Array.from(String(v).trim().slice(0, max * 2).replace(/\u0000/g, ''))
      .filter((c) => !/^[\uD800-\uDFFF]$/.test(c)).slice(0, max).join('').trim()
    : ''
);

// Lista de chaves conhecidas: ausente → []; chave desconhecida → 400; duplicatas somem.
function listaDeChaves(v: any, permitidas: string[], campo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ErroVistoria(`Item inválido: ${campo}`);
  const out: string[] = [];
  for (const k of v) {
    if (typeof k !== 'string' || !permitidas.includes(k)) throw new ErroVistoria(`Item inválido: ${String(k).slice(0, 40)}`);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

// Pneus { posicao: estado } — opcional. Posição sem estado (null/"") = não avaliada, fica
// de fora; posição ou estado desconhecido → 400. Sai na ordem fixa das posições.
function lerPneusVistoria(v: any): Record<string, string> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new ErroVistoria('Item inválido: pneus');
  const lidos: Record<string, string> = {};
  for (const [pos, est] of Object.entries(v)) {
    if (!POSICOES.includes(pos)) throw new ErroVistoria(`Item inválido: ${pos.slice(0, 40)}`);
    if (est === undefined || est === null || est === '') continue;
    if (typeof est !== 'string' || !VISTORIA_ESTADOS_PNEU.includes(est)) throw new ErroVistoria(`Item inválido: ${String(est).slice(0, 40)}`);
    lidos[pos] = est;
  }
  const out: Record<string, string> = {};
  POSICOES.forEach((p) => { const est = lidos[p]; if (est) out[p] = est; });
  return out;
}

// Largura/altura lidas do CABEÇALHO (PNG IHDR / JPEG SOFn), sem decodificar a imagem.
// null = não é PNG nem JPEG (ou cabeçalho ilegível nos primeiros ~300 KB). `bits` = bits
// por canal do PNG (no JPEG não é conferido, sai sempre 8).
function dimensoesFotoVistoria(buf: Buffer): { tipo: 'png' | 'jpeg'; w: number; h: number; bits: number } | null {
  if (buf.length >= 26 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a
    && buf.toString('latin1', 12, 16) === 'IHDR') {
    return { tipo: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bits: buf.readUInt8(24) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf.readUInt8(i) !== 0xff) { i++; continue; }
      const mk = buf.readUInt8(i + 1);
      if (mk === 0xff) { i++; continue; } // byte de preenchimento
      // SOF0..SOF15 (menos DHT C4, JPG C8, DAC CC): altura em +5, largura em +7.
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) {
        return { tipo: 'jpeg', w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), bits: 8 };
      }
      if (mk === 0xd9 || mk === 0xda) return null; // fim/dados da imagem antes do SOF
      if (mk === 0x01 || (mk >= 0xd0 && mk <= 0xd8)) { i += 2; continue; } // marcadores sem tamanho
      const tam = buf.readUInt16BE(i + 2);
      if (tam < 2) return null;
      i += 2 + tam;
    }
  }
  return null;
}

// Tipo e tamanho de CADA foto antes do validarFoto (Jimp) e do salvarFoto:
// - só JPG/PNG: o salvarFoto usa o tipo declarado no data-URL como extensão, e
//   "data:text/html" virava um .html servido no MESMO domínio do painel (script lendo o
//   login do master). Sem prefixo o salvarFoto grava .jpg;
// - no máximo 4096 px de lado (e PNG de até 8 bits): PNG pequeno de 5000x5000 pesava
//   +148 MB no processo do CRM (o mesmo do WhatsApp, que reinicia ao passar de 1 GB).
//   O app manda JPEG de 1280 px de largura, bem abaixo disso.
const FOTO_VISTORIA_PREFIXO = /^data:image\/(jpeg|jpg|png);base64,/i;
const FOTO_VISTORIA_MAX_LADO = 4096;
function conferirFotoVistoria(v: any, rotulo: string): void {
  const tipoErrado = `A foto de "${rotulo}" precisa ser JPG ou PNG. Tire de novo.`;
  if (typeof v !== 'string') throw new ErroVistoria(tipoErrado);
  let ini = 0;
  if (/^data:/i.test(v)) {
    const m = FOTO_VISTORIA_PREFIXO.exec(v);
    if (!m) throw new ErroVistoria(tipoErrado);
    ini = m[0].length;
  }
  const dim = dimensoesFotoVistoria(Buffer.from(v.slice(ini, ini + 400000), 'base64'));
  if (!dim || !dim.w || !dim.h) throw new ErroVistoria(`Não consegui ler a foto de "${rotulo}". Tire de novo.`);
  if (dim.w > FOTO_VISTORIA_MAX_LADO || dim.h > FOTO_VISTORIA_MAX_LADO || (dim.tipo === 'png' && dim.bits > 8)) {
    throw new ErroVistoria(`A foto de "${rotulo}" está grande demais. Tire de novo.`);
  }
}

// Valida o corpo INTEIRO (menos a qualidade das fotos, que é async e vem logo depois).
// Não grava nada. Lança ErroVistoria com a mensagem pro mecânico.
function lerVistoria(b: any) {
  const placa = normalizarPlaca(b.placa);
  if (!PLACA_VISTORIA.test(placa)) throw new ErroVistoria('Placa inválida.');

  // km inteiro 0..2.000.000 — número ou texto só com dígitos (sem vazio/negativo/decimal).
  const kmTxt = typeof b.km === 'number' ? String(b.km) : typeof b.km === 'string' ? b.km.trim() : '';
  if (!/^\d{1,7}$/.test(kmTxt) || Number(kmTxt) > 2000000) throw new ErroVistoria('Informe o km do carro.');
  const km = Number(kmTxt);

  const combustivel = typeof b.combustivel === 'string' ? b.combustivel.trim() : '';
  if (!VISTORIA_COMBUSTIVEL.includes(combustivel)) throw new ErroVistoria('Informe o nível de combustível.');

  const luzesPainel = listaDeChaves(b.luzesPainel, VISTORIA_LUZES, 'luzesPainel');
  if (luzesPainel.includes('nenhuma') && luzesPainel.length > 1) {
    throw new ErroVistoria('Luzes do painel: "Nenhuma" não pode ser marcada junto com outra luz.');
  }
  const avarias = listaDeChaves(b.avarias, VISTORIA_AVARIAS, 'avarias');
  if (avarias.includes('nenhuma') && avarias.length > 1) {
    throw new ErroVistoria('Avarias: "Sem avaria" não pode ser marcado junto com outra avaria.');
  }
  const itens = listaDeChaves(b.itens, VISTORIA_ITENS, 'itens');
  const pneus = lerPneusVistoria(b.pneus);

  // idCliente (uuid do app): opcional; se vier, só letras/números/hífen, 8..64.
  let idCliente: string | null = null;
  if (b.idCliente !== undefined && b.idCliente !== null && b.idCliente !== '') {
    if (typeof b.idCliente !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(b.idCliente)) {
      throw new ErroVistoria('Identificador do envio inválido. Feche e abra a vistoria de novo.');
    }
    idCliente = b.idCliente;
  }

  for (const f of FOTOS_VISTORIA) {
    if (!b[f.campo]) throw new ErroVistoria(`Falta a foto do ${f.rotulo}.`);
  }
  const fotosAvariasIn: any[] = b.fotosAvariasBase64 === undefined || b.fotosAvariasBase64 === null ? [] : b.fotosAvariasBase64;
  if (!Array.isArray(fotosAvariasIn)) throw new ErroVistoria('Fotos das avarias inválidas.');
  if (fotosAvariasIn.length > MAX_FOTOS_AVARIA) throw new ErroVistoria(`Mande no máximo ${MAX_FOTOS_AVARIA} fotos de avaria.`);
  fotosAvariasIn.forEach((f, i) => { if (!f) throw new ErroVistoria(`A foto da avaria ${i + 1} veio vazia. Tire de novo.`); });
  // Tipo (só JPG/PNG) e tamanho pelo cabeçalho — barato, antes de decodificar qualquer foto.
  FOTOS_VISTORIA.forEach((f) => conferirFotoVistoria(b[f.campo], f.rotulo));
  fotosAvariasIn.forEach((f, i) => conferirFotoVistoria(f, `avaria ${i + 1}`));

  return {
    placa, km, combustivel, luzesPainel, avarias, itens, pneus, idCliente, fotosAvariasIn,
    clienteNome: textoVistoria(b.clienteNome, 120),
    clienteTelefone: soDigitos(typeof b.clienteTelefone === 'string' || typeof b.clienteTelefone === 'number' ? String(b.clienteTelefone).slice(0, 64) : '').slice(0, 13),
    veiculo: textoVistoria(b.veiculo, 120),
    pedidoCliente: textoVistoria(b.pedidoCliente, 1000),
    avariasDescricao: textoVistoria(b.avariasDescricao, 1000),
    objetoValor: b.objetoValor === true,
    objetoValorDescricao: textoVistoria(b.objetoValorDescricao, 500),
    observacoes: textoVistoria(b.observacoes, 2000),
  };
}

// Qualidade das fotos EM SÉRIE (não Promise.all): a decodificação do Jimp é CPU pura
// (não ganha nada em paralelo) e em série só 1 imagem fica na memória por vez — 12 fotos
// de câmera decodificadas juntas pesariam centenas de MB no processo do CRM.
async function primeiroErroFoto(fotos: { base64: any; rotulo: string }[]): Promise<string | null> {
  for (const f of fotos) {
    const e = await validarFoto(f.base64, f.rotulo);
    if (e) return e;
  }
  return null;
}

// Apaga fotos que ESTA requisição acabou de gravar, quando a linha não chegou a ser criada
// (corrida do idCliente ou erro no banco) — senão ficariam arquivos órfãos no disco.
function apagarFotosDaVistoria(urls: string[]): void {
  const dir = path.join(__dirname, '../../public/midias/garantia');
  for (const u of urls) {
    const nome = /^\/midias\/garantia\/([0-9a-f-]{36}\.[a-z0-9]{1,8})$/i.exec(u)?.[1];
    if (!nome) continue;
    try { fs.unlinkSync(path.join(dir, nome)); } catch { /* já não existe */ }
  }
}

// Master ou conta com loja. Sem loja (e não master) → 403 e devolve null.
async function escopoVistoria(req: any, res: any): Promise<{ master: boolean; lojaId: string | null } | null> {
  const esc = await escopoGarantia(req);
  if (!esc.master && (!esc.lojaId || esc.lojaId === '__sem_loja__')) {
    res.status(403).json({ error: 'Sua conta não está ligada a uma loja.' });
    return null;
  }
  return esc;
}

// FAZER vistoria (e a sugestão por placa, que só serve pro formulário) é só pra conta de
// MECÂNICO — pedido do dono 29/09. Mesma regra do painel (AtAtendentes.ehMecanico): role
// operador, com o módulo garantia50k e sem nenhum módulo de atendimento (at-*). Lê do banco,
// não do token. VER as vistorias (lista/detalhe, painel) continua pra quem tem o módulo.
const RECUSA_MECANICO = 'A vistoria de entrada é só pra conta de mecânico.';
async function ehContaMecanico(req: any): Promise<boolean> {
  const uid = req.user?.sub;
  if (!uid) return false;
  const u = await prisma.usuario.findUnique({ where: { id: String(uid) }, select: { role: true, modulosPermitidos: true } });
  if (!u || u.role !== 'operador') return false;
  let mods: unknown = [];
  try { mods = JSON.parse(u.modulosPermitidos || '[]'); } catch { mods = []; }
  if (!Array.isArray(mods)) return false;
  return mods.includes('garantia50k') && !mods.some((m) => String(m).startsWith('at-'));
}

// Garantia EM ANDAMENTO mais recente da placa (sem escopo — qualquer loja atende qualquer
// carro, mesma política do /garantias/por-placa). Expira as vencidas antes, como lá.
async function garantiaEmAndamentoDaPlaca(placa: string) {
  await expirarVencidas();
  const veiculo = await prisma.garantiaVeiculo.findUnique({ where: { placa } });
  if (!veiculo) return null;
  const garantia = await prisma.garantia.findFirst({
    where: { veiculoId: veiculo.id, status: { in: GARANTIA_EM_ANDAMENTO } },
    orderBy: { criadoEm: 'desc' },
  });
  return garantia ? { garantia, veiculo } : null;
}

// Campos JSON guardados como texto → arrays/objeto de verdade na saída (JSON quebrado
// cai em []/{} em vez de derrubar a lista inteira).
const jsonLista = (s: string): unknown[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; } };
const jsonObjeto = (s: string): Record<string, unknown> => {
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
function vistoriaSaida<T extends { luzesPainel: string; avarias: string; pneus: string; itens: string; fotosAvarias: string }>(v: T, lojaNome: string | null) {
  return {
    ...v,
    luzesPainel: jsonLista(v.luzesPainel),
    avarias: jsonLista(v.avarias),
    pneus: jsonObjeto(v.pneus),
    itens: jsonLista(v.itens),
    fotosAvarias: jsonLista(v.fotosAvarias),
    lojaNome,
  };
}

// idCliente repetido: é o MESMO envio (duplo toque / reenvio após queda de rede) só se for
// a mesma placa e da mesma conta/loja — aí devolve a vistoria já gravada (200, sem regravar
// fotos). Se o idCliente bater com vistoria de outra placa/loja, não finge que salvou.
function responderVistoriaExistente(
  res: any,
  ja: { id: string; garantiaId: string | null; criadoEm: Date; placa: string; criadoPorId: string | null; lojaId: string | null },
  placa: string, esc: { master: boolean; lojaId: string | null }, uid: string,
) {
  const mesmoEnvio = ja.placa === placa && (esc.master || ja.criadoPorId === uid || (!!ja.lojaId && ja.lojaId === esc.lojaId));
  if (!mesmoEnvio) {
    return res.status(409).json({ error: 'Este envio conflita com outra vistoria. Feche e abra a vistoria de novo.' });
  }
  return res.status(200).json({ id: ja.id, garantiaId: ja.garantiaId, criadoEm: ja.criadoEm, duplicada: true });
}

// Registra uma vistoria. Valida TUDO (inclusive a qualidade das 6 fotos + avarias) ANTES
// de gravar qualquer foto ou linha.
router.post('/vistorias', async (req, res) => {
  try {
    const esc = await escopoVistoria(req, res);
    if (!esc) return;
    if (!(await ehContaMecanico(req))) return res.status(403).json({ error: RECUSA_MECANICO });
    const uid = String(req.user?.sub || '');

    let d: ReturnType<typeof lerVistoria>;
    try {
      d = lerVistoria(req.body || {});
    } catch (e) {
      if (e instanceof ErroVistoria) return res.status(400).json({ error: e.message });
      throw e;
    }
    const b = req.body || {};

    // Reenvio do mesmo formulário: responde com o que já está gravado, sem validar/gravar
    // foto de novo.
    if (d.idCliente) {
      const ja = await prisma.garantiaVistoria.findUnique({ where: { idCliente: d.idCliente } });
      if (ja) return responderVistoriaExistente(res, ja, d.placa, esc, uid);
    }

    const erroFoto = await primeiroErroFoto([
      ...FOTOS_VISTORIA.map((f) => ({ base64: b[f.campo], rotulo: f.rotulo })),
      ...d.fotosAvariasIn.map((f, i) => ({ base64: f, rotulo: `avaria ${i + 1}` })),
    ]);
    if (erroFoto) return res.status(400).json({ error: erroFoto });

    const achada = await garantiaEmAndamentoDaPlaca(d.placa);
    const eu = uid ? await prisma.usuario.findUnique({ where: { id: uid }, select: { nome: true, lojaId: true } }) : null;
    // Loja carimbada: a da conta (no escopo); master sem loja → null.
    const lojaId = esc.master ? (eu?.lojaId || null) : esc.lojaId;

    // Daqui pra baixo grava. Se a linha não for criada, apaga as fotos desta requisição.
    const salvas: string[] = [];
    const salvar = (base64: any): string => {
      const url = salvarFoto(base64);
      if (!url) throw new Error('Não consegui salvar uma das fotos. Tente de novo.');
      salvas.push(url);
      return url;
    };
    try {
      const fotoOdometroUrl = salvar(b.fotoOdometroBase64);
      const fotoPainelUrl = salvar(b.fotoPainelBase64);
      const fotoFrenteUrl = salvar(b.fotoFrenteBase64);
      const fotoTraseiraUrl = salvar(b.fotoTraseiraBase64);
      const fotoLadoEsquerdoUrl = salvar(b.fotoLadoEsquerdoBase64);
      const fotoLadoDireitoUrl = salvar(b.fotoLadoDireitoBase64);
      const fotosAvarias = d.fotosAvariasIn.map((f) => salvar(f));
      const v = await prisma.garantiaVistoria.create({
        data: {
          idCliente: d.idCliente,
          placa: d.placa,
          garantiaId: achada?.garantia.id || null,
          clienteNome: d.clienteNome,
          clienteTelefone: d.clienteTelefone,
          veiculo: d.veiculo,
          pedidoCliente: d.pedidoCliente,
          km: d.km,
          combustivel: d.combustivel,
          luzesPainel: JSON.stringify(d.luzesPainel),
          avarias: JSON.stringify(d.avarias),
          avariasDescricao: d.avariasDescricao,
          pneus: JSON.stringify(d.pneus),
          itens: JSON.stringify(d.itens),
          objetoValor: d.objetoValor,
          objetoValorDescricao: d.objetoValorDescricao,
          observacoes: d.observacoes,
          fotoOdometroUrl, fotoPainelUrl, fotoFrenteUrl, fotoTraseiraUrl, fotoLadoEsquerdoUrl, fotoLadoDireitoUrl,
          fotosAvarias: JSON.stringify(fotosAvarias),
          mecanico: eu?.nome || '',
          criadoPorId: uid || null,
          lojaId,
        },
      });
      return res.status(201).json({ id: v.id, garantiaId: v.garantiaId, criadoEm: v.criadoEm });
    } catch (e: any) {
      apagarFotosDaVistoria(salvas);
      // Corrida: dois envios do mesmo idCliente ao mesmo tempo — o 2º bate no @unique.
      if (e?.code === 'P2002' && d.idCliente) {
        const ja = await prisma.garantiaVistoria.findUnique({ where: { idCliente: d.idCliente } });
        if (ja) return responderVistoriaExistente(res, ja, d.placa, esc, uid);
      }
      throw e;
    }
  } catch (e) { erro(res, e); }
});

// Lista (painel e app): master vê todas; loja só as dela. ?placa= filtro exato; ?limite=
// padrão 100, máx 300. Loja carregada numa query só (sem N+1).
router.get('/vistorias', async (req, res) => {
  try {
    const esc = await escopoVistoria(req, res);
    if (!esc) return;
    const where: any = { ...whereEscopo(esc) };
    const placa = normalizarPlaca(req.query.placa);
    if (placa) where.placa = placa;
    const n = Math.floor(Number(req.query.limite));
    const limite = Number.isFinite(n) && n >= 1 ? Math.min(300, n) : 100;
    const vistorias = await prisma.garantiaVistoria.findMany({ where, orderBy: { criadoEm: 'desc' }, take: limite });
    const lojaIds = [...new Set(vistorias.map((v) => v.lojaId).filter(Boolean) as string[])];
    const lojas = lojaIds.length ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } }) : [];
    const lojaPorId: Record<string, string> = Object.fromEntries(lojas.map((l) => [l.id, l.store_name]));
    res.json({ vistorias: vistorias.map((v) => vistoriaSaida(v, v.lojaId ? (lojaPorId[v.lojaId] ?? null) : null)) });
  } catch (e) { erro(res, e); }
});

// Sugestão pra preencher o formulário quando o mecânico termina de digitar a placa.
// `garantia` sem escopo (qualquer loja atende qualquer carro) mas só com os campos do
// formulário; `ultimaVistoria` DENTRO do escopo (loja não vê cliente de outra loja).
// Nome/telefone do cliente da GARANTIA só pra master ou loja CREDENCIADA (mesma política
// do /garantias/por-placa); loja não credenciada recebe a garantia com cliente vazio (o
// app ainda mostra "Tem garantia GP" + veículo).
// Declarada ANTES de /vistorias/:id (senão "sugestao" viraria um :id).
router.get('/vistorias/sugestao', async (req, res) => {
  try {
    const esc = await escopoVistoria(req, res);
    if (!esc) return;
    if (!(await ehContaMecanico(req))) return res.status(403).json({ error: RECUSA_MECANICO });
    const placa = normalizarPlaca(req.query.placa);
    if (!PLACA_VISTORIA.test(placa)) return res.status(400).json({ error: 'Placa inválida.' });

    const achada = await garantiaEmAndamentoDaPlaca(placa);
    let garantia: { id: string; status: string; clienteNome: string; clienteTelefone: string; veiculo: string } | null = null;
    if (achada) {
      const podeVerCliente = await ehCredenciada(req);
      const cliente = podeVerCliente
        ? await prisma.garantiaCliente.findUnique({ where: { id: achada.garantia.clienteId }, select: { nome: true, telefone: true } })
        : null;
      const v = achada.veiculo;
      garantia = {
        id: achada.garantia.id,
        status: achada.garantia.status,
        clienteNome: cliente?.nome || '',
        clienteTelefone: soDigitos(cliente?.telefone || ''),
        veiculo: [v.marca, v.modelo, v.ano > 0 ? String(v.ano) : ''].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
      };
    }
    const ultimaVistoria = await prisma.garantiaVistoria.findFirst({
      where: { placa, ...whereEscopo(esc) },
      orderBy: { criadoEm: 'desc' },
      select: { clienteNome: true, clienteTelefone: true, veiculo: true, km: true, criadoEm: true },
    });
    res.json({ garantia, ultimaVistoria });
  } catch (e) { erro(res, e); }
});

// Uma vistoria (mesmo formato de um item da lista). Fora do escopo ou inexistente → 404.
router.get('/vistorias/:id', async (req, res) => {
  try {
    const esc = await escopoVistoria(req, res);
    if (!esc) return;
    const v = await prisma.garantiaVistoria.findFirst({ where: { id: String(req.params.id), ...whereEscopo(esc) } });
    if (!v) return res.status(404).json({ error: 'Vistoria não encontrada.' });
    const loja = v.lojaId ? await prisma.loja.findUnique({ where: { id: v.lojaId }, select: { store_name: true } }) : null;
    res.json(vistoriaSaida(v, loja ? loja.store_name : null));
  } catch (e) { erro(res, e); }
});

export default router;
