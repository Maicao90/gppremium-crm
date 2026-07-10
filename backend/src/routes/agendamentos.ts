import { Router } from 'express';
import { prisma, io } from '../server';
import { ehEscopado, idsAtendentesDaLoja } from '../auth/escopoLoja';
import { resolverNumeroContato } from '../utils/resolverNumeroContato';

const router = Router();

// Listar agendamentos (permite isolar agendamentos de operadores pelo query param criadoPorId)
router.get('/', async (req, res) => {
  try {
    const { criadoPorId } = req.query;
    const where: any = {};

    if (criadoPorId && criadoPorId !== 'undefined' && criadoPorId !== 'null') {
      where.criadoPorId = String(criadoPorId);
    }

    // Gerente logado só vê agendamentos dos atendentes da própria loja
    // (sobrepõe qualquer criadoPorId pedido pelo cliente).
    if (ehEscopado(req)) {
      where.criadoPorId = { in: (await idsAtendentesDaLoja(req)) || [] };
    }

    const agendamentos = await prisma.agendamento.findMany({
      where,
      include: { criadoPor: true },
      orderBy: { enviarEm: 'asc' }
    });
    res.json(agendamentos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar agendamentos' });
  }
});

// Gráfico de envios por dia (últimos N dias). Opcional: filtra por criadoPorId.
router.get('/grafico', async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(String(req.query.dias)) || 7, 1), 60);
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (dias - 1));

    const where: any = { status: 'enviado', atualizadoEm: { gte: inicio } };
    const { criadoPorId } = req.query;
    if (criadoPorId && criadoPorId !== 'undefined' && criadoPorId !== 'null') {
      where.criadoPorId = String(criadoPorId);
    }
    // Gerente só vê o gráfico dos atendentes da própria loja.
    if (ehEscopado(req)) {
      where.criadoPorId = { in: (await idsAtendentesDaLoja(req)) || [] };
    }

    const enviados = await prisma.agendamento.findMany({ where, select: { atualizadoEm: true } });

    // Inicializa todos os dias com 0
    const mapa: Record<string, number> = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      mapa[d.toISOString().slice(0, 10)] = 0;
    }
    enviados.forEach(e => {
      const key = new Date(e.atualizadoEm).toISOString().slice(0, 10);
      if (mapa[key] !== undefined) mapa[key]++;
    });

    res.json(Object.entries(mapa).map(([dia, total]) => ({ dia, total })));
  } catch (error) {
    console.error('Erro ao gerar gráfico:', error);
    res.status(500).json({ error: 'Erro ao gerar gráfico' });
  }
});

// Criar agendamento
router.post('/', async (req, res) => {
  try {
    const { cliente, numero, mensagem, enviarEm, criadoPorId, cancelarSeResponder } = req.body;

    let usuario = await prisma.usuario.findUnique({ where: { id: criadoPorId } });
    if (!usuario) {
      usuario = await prisma.usuario.create({
        data: { id: criadoPorId, nome: 'Atendente ' + criadoPorId.substring(0,4) }
      });
    }

    // A extensão manda o NOME no campo numero quando não conseguiu extrair o telefone
    // da tela do WhatsApp. Resolve aqui (agenda sincronizada + histórico); se não der,
    // recusa JÁ com mensagem clara — antes aceitava e falhava em silêncio no disparo.
    const entrada = String(numero ?? '').trim() || String(cliente ?? '').trim();
    const numeroResolvido = await resolverNumeroContato(usuario.id, entrada);
    if (!numeroResolvido) {
      return res.status(400).json({ error: `Não encontrei o número de "${entrada || 'contato'}" nos contatos. Digite o número do WhatsApp com DDD (ex.: 61999998888).` });
    }

    const agendamento = await prisma.agendamento.create({
      data: {
        cliente,
        numero: numeroResolvido,
        mensagem,
        enviarEm: new Date(enviarEm),
        criadoPorId: usuario.id,
        cancelarSeResponder: cancelarSeResponder !== undefined ? cancelarSeResponder : true
      }
    });

    // Envia o evento de socket isolado para a sala do usuário
    io.to(usuario.id).emit('AGENDAMENTO_CRIADO', agendamento);
    res.status(201).json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Atualizar status
router.put('/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { status, observacoes } = req.body;

    if (ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      const alvo = await prisma.agendamento.findUnique({ where: { id } });
      if (!alvo || !ids.includes(alvo.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }

    const updateData: any = { status };
    if (observacoes !== undefined) {
      updateData.observacoes = typeof observacoes === 'object' ? JSON.stringify(observacoes) : observacoes;
    }

    const agendamento = await prisma.agendamento.update({
      where: { id },
      data: updateData
    });

    io.to(agendamento.criadoPorId).emit('STATUS_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Excluir agendamento
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const agendamento = await prisma.agendamento.findUnique({ where: { id } });
    if (ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      if (!agendamento || !ids.includes(agendamento.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }
    if (agendamento) {
      await prisma.agendamento.delete({
        where: { id }
      });
      io.to(agendamento.criadoPorId).emit('AGENDAMENTO_EXCLUIDO', { id });
    }
    res.sendStatus(204);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
});

// Editar agendamento
router.put('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { cliente, numero, mensagem, enviarEm, cancelarSeResponder } = req.body;

    const agendamentoAtual = await prisma.agendamento.findUnique({ where: { id } });
    if (!agendamentoAtual) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    if (ehEscopado(req)) {
      const ids = (await idsAtendentesDaLoja(req)) || [];
      if (!ids.includes(agendamentoAtual.criadoPorId)) return res.status(403).json({ error: 'Sem acesso a este agendamento.' });
    }

    const novoStatus = agendamentoAtual.status === 'falhou' || agendamentoAtual.status === 'cliente_respondeu' ? 'pendente' : agendamentoAtual.status;

    const agendamento = await prisma.agendamento.update({
      where: { id },
      data: {
        cliente,
        numero,
        mensagem,
        enviarEm: new Date(enviarEm),
        cancelarSeResponder: cancelarSeResponder !== undefined ? cancelarSeResponder : true,
        status: novoStatus
      }
    });

    io.to(agendamento.criadoPorId).emit('AGENDAMENTO_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao editar agendamento' });
  }
});

export default router;

