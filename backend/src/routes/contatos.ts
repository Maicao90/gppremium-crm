import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

// Listar todos os contatos
router.get('/', async (req, res) => {
  try {
    const contatos = await prisma.contato.findMany({
      orderBy: { nome: 'asc' }
    });
    res.json(contatos);
  } catch (error) {
    console.error('Erro ao buscar contatos:', error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Sincronizar contatos em lote (upsert otimizado)
router.post('/sincronizar', async (req, res) => {
  try {
    const { contatos } = req.body;
    if (!Array.isArray(contatos)) {
      return res.status(400).json({ error: 'Formato inválido. "contatos" deve ser um array.' });
    }

    console.log(`[Backend] Iniciando sincronização de ${contatos.length} contatos recebidos...`);

    // 1. Obter contatos já existentes no banco (apenas numero e nome)
    const contatosExistentes = await prisma.contato.findMany({
      select: { numero: true, nome: true }
    });

    // 2. Mapear existentes em memória
    const mapaExistentes = new Map<string, string>();
    for (const c of contatosExistentes) {
      mapaExistentes.set(c.numero, c.nome);
    }

    const novosParaInserir: { numero: string; nome: string }[] = [];
    const paraAtualizar: { numero: string; nome: string }[] = [];
    const numerosProcessados = new Set<string>();

    // 3. Classificar contatos
    for (const c of contatos) {
      if (!c.numero) continue;
      const numLimpo = c.numero.replace(/\D/g, '');
      if (!numLimpo) continue;

      if (numerosProcessados.has(numLimpo)) continue;
      numerosProcessados.add(numLimpo);

      const nomeExistente = mapaExistentes.get(numLimpo);

      if (nomeExistente === undefined) {
        novosParaInserir.push({ numero: numLimpo, nome: c.nome || '' });
      } else if (nomeExistente !== c.nome) {
        paraAtualizar.push({ numero: numLimpo, nome: c.nome || '' });
      }
    }

    console.log(`[Backend] Sincronização pré-processada: ${novosParaInserir.length} novos, ${paraAtualizar.length} atualizações, ${contatos.length - novosParaInserir.length - paraAtualizar.length} inalterados.`);

    // 4. Inserir novos em lote (createMany)
    if (novosParaInserir.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < novosParaInserir.length; i += chunkSize) {
        const chunk = novosParaInserir.slice(i, i + chunkSize);
        await prisma.contato.createMany({
          data: chunk
        });
      }
      console.log(`[Backend] ${novosParaInserir.length} novos contatos inseridos no SQLite.`);
    }

    // 5. Atualizar alterados pontualmente em lotes transacionados
    if (paraAtualizar.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < paraAtualizar.length; i += chunkSize) {
        const chunk = paraAtualizar.slice(i, i + chunkSize);
        const updates = chunk.map(c => 
          prisma.contato.update({
            where: { numero: c.numero },
            data: { nome: c.nome }
          })
        );
        await prisma.$transaction(updates);
      }
      console.log(`[Backend] ${paraAtualizar.length} contatos atualizados no SQLite.`);
    }

    console.log(`[Backend] Sincronização finalizada com sucesso total.`);
    res.json({ success: true, count: contatos.length, inserted: novosParaInserir.length, updated: paraAtualizar.length });
  } catch (error) {
    console.error('Erro ao sincronizar contatos:', error);
    res.status(500).json({ error: 'Erro ao sincronizar contatos' });
  }
});

export default router;
