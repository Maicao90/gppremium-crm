import { Router } from 'express';
import { prisma } from '../server';
import { ehMaster } from '../auth/modulos';
import { CATALOGO_FLUXO, GRUPOS_FLUXO, categoriaPorChave, validarTextoFluxo } from '../data/fluxoCatalogo';

// Tela "Fluxo" do painel: mostra o mapa do atendimento do robo (catalogo em
// data/fluxoCatalogo.ts) e deixa o dono editar o TEXTO de cada resposta fixa.
// So o texto e editavel — numero (preco, parcela, desconto) sai sempre da tabela de precos.
// Guardamos so a DIFERENCA do padrao (tabela FluxoResposta); apagar volta pro padrao.
// Ver a tela exige o modulo 'at-fluxo'; editar/restaurar exige master/admin.

const router = Router();

function lerPartes(json: string): string[] | null {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) && p.length > 0 ? p.map(String) : null;
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const linhas = await prisma.fluxoResposta.findMany();
    const porChave = new Map(linhas.map((l) => [l.chave, l]));
    const categorias = CATALOGO_FLUXO.map((c) => {
      const edicao = c.partes ? porChave.get(c.chave) : undefined;
      const editadas = edicao ? lerPartes(edicao.partes) : null;
      return {
        ...c,
        atual: c.partes ? (editadas ?? c.partes) : null,
        personalizado: !!editadas,
        atualizadoEm: editadas && edicao ? edicao.atualizadoEm : null,
      };
    });
    res.json({ grupos: GRUPOS_FLUXO, categorias, podeEditar: ehMaster(String(req.user?.role || '')) });
  } catch (e: any) {
    console.error('[Fluxo] GET:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível carregar o fluxo.' });
  }
});

router.put('/:chave', async (req, res) => {
  try {
    if (!ehMaster(String(req.user?.role || ''))) return res.status(403).json({ error: 'Apenas o administrador pode editar as respostas.' });
    const chave = String(req.params.chave || '');
    const cat = categoriaPorChave(chave);
    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });

    const partes = Array.isArray(req.body?.partes) ? req.body.partes.map((p: unknown) => String(p ?? '').trim()) : req.body?.partes;
    const problemas = validarTextoFluxo(chave, partes);
    if (problemas.length) return res.status(400).json({ error: problemas.join(' '), problemas });

    // Igual ao padrao = sem edicao (nao deixa linha "personalizada" sem diferenca nenhuma).
    if (JSON.stringify(partes) === JSON.stringify(cat.partes)) {
      await prisma.fluxoResposta.deleteMany({ where: { chave } });
      return res.json({ ok: true, personalizado: false, atual: cat.partes });
    }
    const linha = await prisma.fluxoResposta.upsert({
      where: { chave },
      create: { chave, partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
      update: { partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
    });
    res.json({ ok: true, personalizado: true, atual: partes, atualizadoEm: linha.atualizadoEm });
  } catch (e: any) {
    console.error('[Fluxo] PUT:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível salvar a resposta.' });
  }
});

router.delete('/:chave', async (req, res) => {
  try {
    if (!ehMaster(String(req.user?.role || ''))) return res.status(403).json({ error: 'Apenas o administrador pode restaurar as respostas.' });
    const chave = String(req.params.chave || '');
    const cat = categoriaPorChave(chave);
    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });
    await prisma.fluxoResposta.deleteMany({ where: { chave } });
    res.json({ ok: true, personalizado: false, atual: cat.partes });
  } catch (e: any) {
    console.error('[Fluxo] DELETE:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível restaurar a resposta.' });
  }
});

export default router;
