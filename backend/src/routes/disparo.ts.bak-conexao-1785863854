import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../server';
import { resolverConexaoEfetiva, enviarMensagem } from '../workers/whatsappService';

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

// Salva a foto do disparo em disco e devolve o caminho (mesmo padrão dos agendamentos).
function salvarFotoDisparo(base64: string): { caminho: string; absoluto: string } {
  let dados = String(base64 || '');
  let ext = 'jpg';
  const m = /^data:image\/([^;]+);base64,([\s\S]*)$/.exec(dados);
  if (m && m[1] && m[2]) {
    // `noUncheckedIndexedAccess` liga: split() devolve possivelmente undefined no [0].
    ext = (m[1].split(';')[0] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
    dados = m[2];
  }
  const buffer = Buffer.from(dados, 'base64');
  if (buffer.length === 0) throw new Error('arquivo vazio');
  const dir = path.join(__dirname, '../../public/midias/disparo');
  fs.mkdirSync(dir, { recursive: true });
  const nome = crypto.randomUUID() + '.' + ext;
  const absoluto = path.join(dir, nome);
  fs.writeFileSync(absoluto, buffer);
  return { caminho: '/midias/disparo/' + nome, absoluto };
}

// Lista os contatos de uma loja (campanha de disparo manual). Ordenado por valor já
// gasto (maior primeiro) — prioriza quem tem mais histórico de compra.
router.get('/contatos', async (req, res) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' });
    const contatos = await prisma.disparoContato.findMany({ where: { storeId }, orderBy: { valor: 'desc' } });
    res.json(contatos);
  } catch (e) { erro(res, e); }
});

// Marca/desmarca "contatado" pelo CHECKBOX manual (ex.: "já contatei por telefone") —
// não conta pro limite diário, que é só sobre mensagens de fato abertas pelo botão.
router.patch('/contatos/:id', async (req, res) => {
  try {
    const contatado = Boolean(req.body.contatado);
    const contato = await prisma.disparoContato.update({
      where: { id: req.params.id },
      data: { contatado, contatadoEm: contatado ? new Date() : null },
    });
    res.json(contato);
  } catch (e) { erro(res, e); }
});

// Clique no botão "Abrir WhatsApp": marca contatado E conta pro limite diário.
router.post('/contatos/:id/enviar', async (req, res) => {
  try {
    const agora = new Date();
    const contato = await prisma.disparoContato.update({
      where: { id: req.params.id },
      data: { contatado: true, contatadoEm: agora, enviadoEm: agora },
    });
    res.json(contato);
  } catch (e) { erro(res, e); }
});

// CAMPANHA da loja: a arte que vai junto do texto e o teto diário. Fica salvo no
// servidor pra a foto não sumir ao recarregar a página nem precisar ser reanexada por
// cada operador — e pro limite valer de verdade, não só no navegador de quem abriu.
async function campanhaDaLoja(storeId: string) {
  const existente = await prisma.disparoCampanha.findUnique({ where: { storeId } });
  if (existente) return existente;
  return prisma.disparoCampanha.create({ data: { storeId } });
}

router.get('/campanha', async (req, res) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' });
    const c = await campanhaDaLoja(storeId);
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    const enviadosHoje = await prisma.disparoContato.count({ where: { storeId, enviadoEm: { gte: inicio } } });
    res.json({ fotoUrl: c.fotoUrl, fotoNome: c.fotoNome, limiteDia: c.limiteDia, enviadosHoje });
  } catch (e) { erro(res, e); }
});

// Define/troca a arte da campanha (uma vez, vale pra todos os disparos daquela loja).
router.post('/campanha/foto', async (req, res) => {
  try {
    const storeId = String(req.body?.storeId || '');
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' });
    const c = await campanhaDaLoja(storeId);

    // Sem fotoBase64 = pedido pra REMOVER a arte atual.
    if (!req.body?.fotoBase64) {
      if (c.fotoUrl) { try { fs.unlinkSync(path.join(__dirname, '../../public', c.fotoUrl)); } catch { /* noop */ } }
      const zerada = await prisma.disparoCampanha.update({ where: { storeId }, data: { fotoUrl: null, fotoNome: null } });
      return res.json({ fotoUrl: zerada.fotoUrl, fotoNome: zerada.fotoNome, limiteDia: zerada.limiteDia });
    }

    let salvo;
    try { salvo = salvarFotoDisparo(String(req.body.fotoBase64)); }
    catch { return res.status(400).json({ error: 'Não consegui ler a imagem. Tente outro arquivo.' }); }

    // Apaga a arte anterior pra não acumular lixo no disco a cada troca de campanha.
    if (c.fotoUrl) { try { fs.unlinkSync(path.join(__dirname, '../../public', c.fotoUrl)); } catch { /* noop */ } }

    const atualizada = await prisma.disparoCampanha.update({
      where: { storeId },
      data: { fotoUrl: salvo.caminho, fotoNome: String(req.body?.fotoNome || '').slice(0, 200) || null },
    });
    res.json({ fotoUrl: atualizada.fotoUrl, fotoNome: atualizada.fotoNome, limiteDia: atualizada.limiteDia });
  } catch (e) { erro(res, e); }
});

// Ajusta o teto diário da loja (padrão 30).
router.post('/campanha/limite', async (req, res) => {
  try {
    const storeId = String(req.body?.storeId || '');
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' });
    const limiteDia = Math.max(1, Math.min(500, Number(req.body?.limiteDia) || 30));
    await campanhaDaLoja(storeId);
    const c = await prisma.disparoCampanha.update({ where: { storeId }, data: { limiteDia } });
    res.json({ limiteDia: c.limiteDia });
  } catch (e) { erro(res, e); }
});

// ENVIO DE VERDADE, com FOTO + texto numa mensagem só (a foto vai com o texto como
// legenda). O "Abrir WhatsApp" acima não conseguia anexar foto porque o link wa.me do
// WhatsApp não aceita mídia — só texto. Aqui o envio sai pelo mesmo motor do
// agendamento (Baileys), que já simula digitação e respeita o número da loja.
//
// Continua sendo UM CLIQUE = UMA MENSAGEM: não existe "enviar pra lista toda". O
// operador escolhe cliente por cliente, e o limite diário é conferido AQUI no servidor
// (não dá pra furar abrindo outra aba) — foi assim que o módulo nasceu, pra não parecer
// robô de spam e arriscar bloqueio do número.
router.post('/contatos/:id/enviar-whatsapp', async (req, res) => {
  try {
    const contato = await prisma.disparoContato.findUnique({ where: { id: String(req.params.id) } });
    if (!contato) return res.status(404).json({ error: 'Contato não encontrado.' });

    const numero = String(contato.tel || '').replace(/\D/g, '');
    if (!numero || numero.length < 12) {
      return res.status(400).json({ error: 'Este contato não tem número de WhatsApp válido.' });
    }

    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ error: 'Escreva a mensagem antes de enviar.' });

    // TRAVA DE VERDADE do limite diário: conta no banco, então vale pra loja inteira,
    // em qualquer aba/computador. Antes o teto era só um botão desabilitado na tela.
    const campanha = await campanhaDaLoja(contato.storeId);
    const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0);
    const enviadosHoje = await prisma.disparoContato.count({
      where: { storeId: contato.storeId, enviadoEm: { gte: inicioDoDia } },
    });
    if (enviadosHoje >= campanha.limiteDia) {
      return res.status(429).json({
        error: `Limite diário atingido (${enviadosHoje}/${campanha.limiteDia}). Continue amanhã — mandar demais de uma vez é o que faz o WhatsApp bloquear o número.`,
      });
    }

    // Quem envia: o atendente logado. A sessão real pode ser a de outro (compartilhada).
    const usuarioId = String(req.user?.sub || '');
    if (!usuarioId) return res.status(401).json({ error: 'Não autenticado.' });
    const efetivoId = await resolverConexaoEfetiva(usuarioId);

    // A ARTE DA CAMPANHA (salva uma vez pela tela) vai em TODO disparo desta loja, como
    // imagem + o texto de legenda. Nada de reanexar a cada envio.
    const midia = campanha.fotoUrl
      ? { tipo: 'imagem', caminho: campanha.fotoUrl, nome: campanha.fotoNome }
      : undefined;

    const ok = await enviarMensagem(efetivoId, numero, texto, midia);
    if (!ok) return res.status(503).json({ error: 'Não consegui enviar. O WhatsApp desta loja está conectado?' });

    const agora = new Date();
    const atualizado = await prisma.disparoContato.update({
      where: { id: contato.id },
      data: { contatado: true, contatadoEm: agora, enviadoEm: agora },
    });
    res.json({ ok: true, contato: atualizado, comFoto: !!midia });
  } catch (e) { erro(res, e); }
});

// Quantos botões "Abrir WhatsApp" foram clicados HOJE — serve pro limite diário
// respeitar todo mundo que usa a lista (não só quem está no MESMO navegador/aparelho).
router.get('/contatados-hoje', async (req, res) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId) return res.status(400).json({ error: 'storeId obrigatório' });
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const total = await prisma.disparoContato.count({ where: { storeId, enviadoEm: { gte: inicio } } });
    res.json({ total });
  } catch (e) { erro(res, e); }
});

export default router;
