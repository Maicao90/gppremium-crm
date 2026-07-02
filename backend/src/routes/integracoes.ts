import { Router } from 'express';
import { prisma } from '../server';
import * as googleAds from '../integracoes/googleAds';
import * as metaAds from '../integracoes/metaAds';
import { sincronizarConexao } from '../integracoes/syncService';

// ════════════════════════════════════════════════════════════════════════
// ROTAS DE INTEGRAÇÕES DE ANÚNCIOS (Google Ads / Meta Ads)
// ════════════════════════════════════════════════════════════════════════
// Regra de ouro: credenciais NUNCA saem completas pela API — o GET devolve
// apenas versões mascaradas (•••••1234). No update, valores mascarados ou
// vazios significam "manter o que já está salvo".

const router = Router();

const PLATAFORMAS = ['google', 'meta'];
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

// Mascara um valor preservando só os últimos 4 caracteres (ex.: "•••••1234")
function mascarar(valor: unknown): string {
  const s = String(valor ?? '');
  if (!s) return '';
  return '•••••' + (s.length > 4 ? s.slice(-4) : '');
}

// Devolve um objeto com as MESMAS chaves das credenciais, mas valores mascarados
function mascararCredenciais(credenciaisJson: string): Record<string, string> {
  let credenciais: Record<string, unknown> = {};
  try {
    credenciais = JSON.parse(credenciaisJson || '{}') || {};
  } catch {
    credenciais = {};
  }
  const mascaradas: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(credenciais)) {
    mascaradas[chave] = mascarar(valor);
  }
  return mascaradas;
}

// Mescla credenciais novas sobre as antigas: valores vazios ou mascarados
// (contêm '•') são ignorados — mantém-se o que já estava salvo.
function mesclarCredenciais(antigasJson: string, novas: any): string {
  let antigas: Record<string, unknown> = {};
  try {
    antigas = JSON.parse(antigasJson || '{}') || {};
  } catch {
    antigas = {};
  }
  const resultado: Record<string, unknown> = { ...antigas };
  if (novas && typeof novas === 'object') {
    for (const [chave, valor] of Object.entries(novas)) {
      if (typeof valor === 'string' && valor.trim() !== '' && !valor.includes('•')) {
        resultado[chave] = valor.trim();
      }
    }
  }
  return JSON.stringify(resultado);
}

// Formato de saída de uma conexão (contrato da API — sem credenciais completas)
const conexaoOut = (c: any) => ({
  id: c.id,
  plataforma: c.plataforma,
  nome: c.nome,
  companyId: c.company_id,
  storeId: c.store_id,
  ativo: c.ativo,
  ultimaSync: c.ultimaSync,
  ultimoErro: c.ultimoErro,
  credenciaisMascaradas: mascararCredenciais(c.credenciais),
});

/* ===== LISTAR CONEXÕES ===== */
router.get('/', async (_req, res) => {
  try {
    const conexoes = await prisma.conexaoAds.findMany({ orderBy: { criadoEm: 'asc' } });
    res.json(conexoes.map(conexaoOut));
  } catch (e) { erro(res, e); }
});

/* ===== MÉTRICAS AGREGADAS DO PERÍODO ===== */
// GET /api/integracoes/metricas?companyId=X&dias=30
router.get('/metricas', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || '');
    if (!companyId) return res.status(400).json({ error: 'companyId obrigatório' });
    const dias = Math.max(1, parseInt(String(req.query.dias || '30'), 10) || 30);

    const conexoes = await prisma.conexaoAds.findMany({ where: { company_id: companyId } });
    if (conexoes.length === 0) return res.json([]);

    // Janela: últimos N dias (em UTC, mesmo fuso usado ao gravar MetricaDiaria)
    const inicio = new Date();
    inicio.setUTCHours(0, 0, 0, 0);
    inicio.setUTCDate(inicio.getUTCDate() - dias);

    const metricas = await prisma.metricaDiaria.findMany({
      where: { conexaoId: { in: conexoes.map((c: any) => c.id) }, data: { gte: inicio } },
      orderBy: { data: 'asc' },
    });

    // Agrega por campanha externa (o nome mais recente prevalece)
    const porCampanha = new Map<string, any>();
    for (const m of metricas) {
      const atual = porCampanha.get(m.campanhaExternalId) || {
        campanhaExternalId: m.campanhaExternalId,
        campanhaNome: m.campanhaNome,
        plataforma: m.plataforma,
        spend: 0, leads: 0, impressoes: 0, cliques: 0,
      };
      if (m.campanhaNome) atual.campanhaNome = m.campanhaNome;
      atual.spend += m.spend;
      atual.leads += m.leads;
      atual.impressoes += m.impressoes;
      atual.cliques += m.cliques;
      porCampanha.set(m.campanhaExternalId, atual);
    }

    res.json(Array.from(porCampanha.values()).map((c) => ({ ...c, spend: Math.round(c.spend * 100) / 100 })));
  } catch (e) { erro(res, e); }
});

/* ===== CRIAR / ATUALIZAR CONEXÃO ===== */
router.post('/', async (req, res) => {
  try {
    const { id, plataforma, nome, companyId, storeId, credenciais, ativo } = req.body || {};
    if (!PLATAFORMAS.includes(plataforma)) {
      return res.status(400).json({ error: "plataforma deve ser 'google' ou 'meta'" });
    }

    if (id) {
      // UPDATE: credenciais vazias/mascaradas mantêm as que já estão salvas
      const existente = await prisma.conexaoAds.findUnique({ where: { id } });
      if (!existente) return res.status(404).json({ error: 'Conexão não encontrada' });

      await prisma.conexaoAds.update({
        where: { id },
        data: {
          plataforma,
          nome: nome !== undefined ? String(nome) : existente.nome,
          company_id: companyId !== undefined ? String(companyId) : existente.company_id,
          store_id: storeId !== undefined ? (storeId || null) : existente.store_id,
          credenciais: mesclarCredenciais(existente.credenciais, credenciais),
          ativo: typeof ativo === 'boolean' ? ativo : existente.ativo,
        },
      });
      return res.json({ ok: true, id });
    }

    // CREATE
    const criada = await prisma.conexaoAds.create({
      data: {
        plataforma,
        nome: String(nome || ''),
        company_id: String(companyId || ''),
        store_id: storeId || null,
        credenciais: mesclarCredenciais('{}', credenciais),
        ativo: ativo !== false,
      },
    });
    res.json({ ok: true, id: criada.id });
  } catch (e) { erro(res, e); }
});

/* ===== TESTAR CREDENCIAIS (1 chamada real à plataforma) ===== */
router.post('/testar', async (req, res) => {
  try {
    const { plataforma, credenciais } = req.body || {};
    if (!PLATAFORMAS.includes(plataforma)) {
      return res.status(400).json({ error: "plataforma deve ser 'google' ou 'meta'" });
    }
    const resultado = plataforma === 'meta'
      ? await metaAds.testarConexao(credenciais || {})
      : await googleAds.testarConexao(credenciais || {});
    res.json(resultado);
  } catch (e) { erro(res, e); }
});

/* ===== SINCRONIZAR AGORA (manual) ===== */
router.post('/:id/sync', async (req, res) => {
  try {
    res.json(await sincronizarConexao(String(req.params.id)));
  } catch (e) { erro(res, e); }
});

/* ===== EXCLUIR CONEXÃO ===== */
router.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    // Limpa o histórico de métricas junto (as Campanhas do CRM ficam, só perdem o vínculo vivo)
    await prisma.metricaDiaria.deleteMany({ where: { conexaoId: id } });
    await prisma.conexaoAds.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

export default router;
