import { Router } from 'express';
import { prisma, io } from '../server';

const router = Router();

// Listar agendamentos (permite isolar agendamentos de operadores pelo query param criadoPorId)
router.get('/', async (req, res) => {
  try {
    const { criadoPorId } = req.query;
    const where: any = {};
    
    if (criadoPorId && criadoPorId !== 'undefined' && criadoPorId !== 'null') {
      where.criadoPorId = String(criadoPorId);
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

    const agendamento = await prisma.agendamento.create({
      data: {
        cliente,
        numero,
        mensagem,
        enviarEm: new Date(enviarEm),
        criadoPorId: usuario.id,
        cancelarSeResponder: cancelarSeResponder !== undefined ? cancelarSeResponder : true
      }
    });

    // Removemos a fila temporariamente para rodar 100% nativo (sem Redis)
    io.emit('AGENDAMENTO_CRIADO', agendamento);
    res.status(201).json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Atualizar status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const agendamento = await prisma.agendamento.update({
      where: { id },
      data: { status }
    });

    io.emit('STATUS_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Excluir agendamento
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.agendamento.delete({
      where: { id }
    });
    io.emit('AGENDAMENTO_EXCLUIDO', { id });
    res.sendStatus(204);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
});

// Editar agendamento
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { cliente, numero, mensagem, enviarEm, cancelarSeResponder } = req.body;

    const agendamentoAtual = await prisma.agendamento.findUnique({ where: { id } });
    if (!agendamentoAtual) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
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

    io.emit('AGENDAMENTO_ATUALIZADO', agendamento);
    res.json(agendamento);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao editar agendamento' });
  }
});

export default router;

