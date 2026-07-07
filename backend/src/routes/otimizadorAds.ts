import { Router } from 'express';
import { prisma } from '../server';
import { coletarDados, analisar, economiaTotal, executarAcao, AcaoOtimizacao } from '../integracoes/googleAdsOtimizador';
import { coletarDadosMeta, analisarMeta, montarGerenciaveis, economiaTotalMeta, executarAcaoMeta } from '../integracoes/metaAdsOtimizador';

// ════════════════════════════════════════════════════════════════════════
// OTIMIZADOR DE ANÚNCIOS (Google Ads + Meta Ads) — audita a conta ao vivo
// e só aplica uma ação na API quando o usuário aprova explicitamente no painel.
// ════════════════════════════════════════════════════════════════════════

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

async function buscarConexao(conexaoId: string): Promise<{ credenciais: any; nome: string; plataforma: string } | null> {
  const conexao = await prisma.conexaoAds.findUnique({ where: { id: conexaoId } });
  if (!conexao || (conexao.plataforma !== 'google' && conexao.plataforma !== 'meta')) return null;
  let credenciais: any = {};
  try { credenciais = JSON.parse(conexao.credenciais || '{}'); } catch { credenciais = {}; }
  return { credenciais, nome: conexao.nome, plataforma: conexao.plataforma };
}

// Operações de escrita permitidas por plataforma (nunca em lote — 1 por requisição).
const OPS_GOOGLE = ['pause_keyword', 'add_negative', 'update_bid', 'update_budget', 'set_campaign_status', 'change_match_type'];
const OPS_META = ['set_status_meta', 'update_budget_meta'];

/* ===== AUDITORIA: coleta + regras + campanhas gerenciáveis, ao vivo ===== */
router.get('/:conexaoId/auditoria', async (req, res) => {
  try {
    const c = await buscarConexao(String(req.params.conexaoId));
    if (!c) return res.status(404).json({ error: 'Conexão de anúncios não encontrada.' });

    if (c.plataforma === 'meta') {
      const dados = await coletarDadosMeta(c.credenciais);
      const acoes = analisarMeta(dados);
      const gerenciaveis = montarGerenciaveis(dados);
      const resumo = {
        critico: acoes.filter((a) => a.prioridade === 'CRITICO').length,
        alerta: acoes.filter((a) => a.prioridade === 'ALERTA').length,
        sugestao: acoes.filter((a) => a.prioridade === 'SUGESTAO').length,
        economiaEstimadaMes: Math.round(economiaTotalMeta(acoes) * 100) / 100,
        totalCampanhas: dados.campanhas.length,
        totalKeywords: 0,
      };
      // Formato unificado com o Google p/ o painel renderizar igual.
      const campanhas = gerenciaveis.map((g) => ({
        id: g.id,
        nome: g.nome,
        nivel: g.nivel,
        ativa: g.status === 'ACTIVE',
        effectiveStatus: g.effectiveStatus,
        custo30d: g.custo30d,
        budgetDiario: g.budgetDiarioReais,
        podeEditarOrcamento: g.podeEditarOrcamento,
      }));
      return res.json({ nome: c.nome, plataforma: 'meta', resumo, acoes, campanhas });
    }

    // ── Google ──
    const dados = await coletarDados(c.credenciais);
    const acoes = analisar(dados);
    const resumo = {
      critico: acoes.filter((a) => a.prioridade === 'CRITICO').length,
      alerta: acoes.filter((a) => a.prioridade === 'ALERTA').length,
      sugestao: acoes.filter((a) => a.prioridade === 'SUGESTAO').length,
      economiaEstimadaMes: Math.round(economiaTotal(acoes) * 100) / 100,
      totalCampanhas: dados.campanhas.length,
      totalKeywords: dados.keywords.length,
    };
    const campanhas = dados.campanhas.map((camp) => ({
      id: camp.id,
      nome: camp.nome,
      nivel: 'campanha',
      ativa: camp.status === 'ENABLED',
      custo30d: Math.round(camp.custo * 100) / 100,
      budgetDiario: camp.budgetDiario,
      podeEditarOrcamento: !!camp.budgetResourceName,
      campanhaResourceName: camp.campanhaResourceName,
      budgetResourceName: camp.budgetResourceName,
      orcamentoCompartilhado: camp.orcamentoCompartilhado,
      orcamentoRefCount: camp.orcamentoRefCount,
    }));
    res.json({ nome: c.nome, plataforma: 'google', resumo, acoes, campanhas });
  } catch (e) { erro(res, e); }
});

/* ===== EXECUTAR 1 AÇÃO APROVADA (nunca em lote) ===== */
router.post('/:conexaoId/executar', async (req, res) => {
  try {
    const conexaoId = String(req.params.conexaoId);
    const c = await buscarConexao(conexaoId);
    if (!c) return res.status(404).json({ error: 'Conexão de anúncios não encontrada.' });

    const acao: AcaoOtimizacao | undefined = req.body?.acao;
    if (!acao || !acao.operacaoApi) return res.status(400).json({ error: 'Ação inválida.' });

    const permitidas = c.plataforma === 'meta' ? OPS_META : OPS_GOOGLE;
    if (!permitidas.includes(acao.operacaoApi)) {
      return res.status(400).json({ error: 'Esta sugestão exige revisão manual — não há operação automática para aplicar.' });
    }

    const simular = Boolean(req.body?.simular);
    const resultado = c.plataforma === 'meta'
      ? await executarAcaoMeta(c.credenciais, acao, simular)
      : await executarAcao(c.credenciais, acao, simular);

    await prisma.otimizacaoExecucao.create({
      data: {
        conexaoId,
        operacao: acao.operacaoApi,
        entidadeNome: acao.entidadeNome || '',
        acaoResumo: acao.acao || '',
        parametros: JSON.stringify(acao.parametrosApi || {}),
        sucesso: resultado.success,
        resultado: JSON.stringify(resultado),
      },
    });

    res.json(resultado);
  } catch (e) { erro(res, e); }
});

/* ===== HISTÓRICO de ações já aplicadas ===== */
router.get('/:conexaoId/historico', async (req, res) => {
  try {
    const conexaoId = String(req.params.conexaoId);
    const historico = await prisma.otimizacaoExecucao.findMany({
      where: { conexaoId },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
    res.json(historico);
  } catch (e) { erro(res, e); }
});

export default router;
