import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

// Obter configurações globais (se não existir, inicializa com valores padrões)
router.get('/', async (req, res) => {
  try {
    let configuracao = await prisma.configuracao.findUnique({
      where: { id: 'global' }
    });

    if (!configuracao) {
      configuracao = await prisma.configuracao.create({
        data: {
          id: 'global',
          expedienteAtivo: false,
          expedienteInicio: '08:00',
          expedienteFim: '18:00',
          expedienteDias: '1,2,3,4,5' // Segunda a Sexta
        }
      });
    }

    res.json(configuracao);
  } catch (error) {
    console.error("Erro ao obter configurações:", error);
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Atualizar ou Criar configurações globais
router.post('/', async (req, res) => {
  try {
    const { expedienteAtivo, expedienteInicio, expedienteFim, expedienteDias } = req.body;

    const configuracao = await prisma.configuracao.upsert({
      where: { id: 'global' },
      update: {
        expedienteAtivo: expedienteAtivo !== undefined ? Boolean(expedienteAtivo) : false,
        expedienteInicio: expedienteInicio || '08:00',
        expedienteFim: expedienteFim || '18:00',
        expedienteDias: expedienteDias !== undefined ? expedienteDias : '1,2,3,4,5'
      },
      create: {
        id: 'global',
        expedienteAtivo: expedienteAtivo !== undefined ? Boolean(expedienteAtivo) : false,
        expedienteInicio: expedienteInicio || '08:00',
        expedienteFim: expedienteFim || '18:00',
        expedienteDias: expedienteDias !== undefined ? expedienteDias : '1,2,3,4,5'
      }
    });

    res.json(configuracao);
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

export default router;
