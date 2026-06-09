import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

// Listar contatos DO USUÁRIO (cada atendente vê apenas os seus)
router.get('/', async (req, res) => {
  try {
    const usuarioId = String(req.query.usuarioId || '');
    if (!usuarioId) {
      // Sem usuário identificado, não retorna contatos de ninguém.
      return res.json([]);
    }
    const contatos = await prisma.contato.findMany({
      where: { usuarioId },
      orderBy: { nome: 'asc' }
    });
    res.json(contatos);
  } catch (error) {
    console.error('Erro ao buscar contatos:', error);
    res.status(500).json({ error: 'Erro ao buscar contatos' });
  }
});

// Sincronizar contatos em lote (upsert otimizado) — SEMPRE associado a um usuário
router.post('/sincronizar', async (req, res) => {
  try {
    const { contatos, usuarioId } = req.body;
    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId é obrigatório para sincronizar contatos.' });
    }
    if (!Array.isArray(contatos)) {
      return res.status(400).json({ error: 'Formato inválido. "contatos" deve ser um array.' });
    }

    console.log(`[Backend] Sincronizando ${contatos.length} contatos do usuário ${usuarioId}...`);

    // 1. Contatos já existentes DESTE usuário
    const contatosExistentes = await prisma.contato.findMany({
      where: { usuarioId },
      select: { numero: true, nome: true }
    });

    const mapaExistentes = new Map<string, string>();
    for (const c of contatosExistentes) {
      mapaExistentes.set(c.numero, c.nome);
    }

    const novosParaInserir: { usuarioId: string; numero: string; nome: string }[] = [];
    const paraAtualizar: { numero: string; nome: string }[] = [];
    const numerosProcessados = new Set<string>();

    // 2. Classificar
    for (const c of contatos) {
      if (!c.numero) continue;
      const numLimpo = String(c.numero).replace(/\D/g, '');
      if (!numLimpo) continue;

      if (numerosProcessados.has(numLimpo)) continue;
      numerosProcessados.add(numLimpo);

      const nomeExistente = mapaExistentes.get(numLimpo);

      if (nomeExistente === undefined) {
        novosParaInserir.push({ usuarioId, numero: numLimpo, nome: c.nome || '' });
      } else if (nomeExistente !== c.nome) {
        paraAtualizar.push({ numero: numLimpo, nome: c.nome || '' });
      }
    }

    console.log(`[Backend] Pré-processado: ${novosParaInserir.length} novos, ${paraAtualizar.length} atualizações.`);

    // 3. Inserir novos em lote (ignora duplicados por segurança)
    if (novosParaInserir.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < novosParaInserir.length; i += chunkSize) {
        await prisma.contato.createMany({
          data: novosParaInserir.slice(i, i + chunkSize),
          skipDuplicates: true
        });
      }
    }

    // 4. Atualizar alterados (pela chave composta usuarioId + numero)
    if (paraAtualizar.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < paraAtualizar.length; i += chunkSize) {
        const chunk = paraAtualizar.slice(i, i + chunkSize);
        const updates = chunk.map(c =>
          prisma.contato.update({
            where: { usuarioId_numero: { usuarioId, numero: c.numero } },
            data: { nome: c.nome }
          })
        );
        await prisma.$transaction(updates);
      }
    }

    console.log(`[Backend] Sincronização do usuário ${usuarioId} finalizada.`);
    res.json({ success: true, count: contatos.length, inserted: novosParaInserir.length, updated: paraAtualizar.length });
  } catch (error) {
    console.error('Erro ao sincronizar contatos:', error);
    res.status(500).json({ error: 'Erro ao sincronizar contatos' });
  }
});

export default router;
