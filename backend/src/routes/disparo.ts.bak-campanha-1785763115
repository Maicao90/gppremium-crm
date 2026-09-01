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

// ENVIO DE VERDADE, com FOTO + texto numa mensagem só (a foto vai com o texto como
// legenda). O "Abrir WhatsApp" acima não conseguia anexar foto porque o link wa.me do
// WhatsApp não aceita mídia — só texto. Aqui o envio sai pelo mesmo motor do
// agendamento (Baileys), que já simula digitação e respeita o número da loja.
//
// Continua sendo UM CLIQUE = UMA MENSAGEM: não existe "enviar pra lista toda". O
// operador escolhe cliente por cliente, e o limite diário da tela segue valendo — foi
// assim que o módulo nasceu, pra não parecer robô de spam e arriscar bloqueio.
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

    // Quem envia: o atendente logado. A sessão real pode ser a de outro (compartilhada).
    const usuarioId = String(req.user?.sub || '');
    if (!usuarioId) return res.status(401).json({ error: 'Não autenticado.' });
    const efetivoId = await resolverConexaoEfetiva(usuarioId);

    // Foto opcional (data-URL). Se vier, vira uma mensagem única: imagem + legenda.
    let midia: { tipo: string; caminho: string; nome?: string | null } | undefined;
    let arquivoSalvo = '';
    if (req.body?.fotoBase64) {
      try {
        const { caminho, absoluto } = salvarFotoDisparo(String(req.body.fotoBase64));
        arquivoSalvo = absoluto;
        midia = { tipo: 'imagem', caminho, nome: null };
      } catch (e) {
        return res.status(400).json({ error: 'Não consegui ler a foto anexada. Tente outra imagem.' });
      }
    }

    const ok = await enviarMensagem(efetivoId, numero, texto, midia);

    // A foto já foi entregue ao WhatsApp — não precisa ficar ocupando disco na VPS.
    if (arquivoSalvo) { try { fs.unlinkSync(arquivoSalvo); } catch { /* noop */ } }

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
