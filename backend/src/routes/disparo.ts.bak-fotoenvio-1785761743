import { Router } from 'express';
import { prisma } from '../server';

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

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
