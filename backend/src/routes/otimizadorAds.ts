import { Router } from 'express';
import { prisma } from '../server';
import { CredenciaisGoogle } from '../integracoes/googleAds';
import { coletarDados, analisar, economiaTotal, executarAcao, AcaoOtimizacao } from '../integracoes/googleAdsOtimizador';

// ════════════════════════════════════════════════════════════════════════
// OTIMIZADOR DE GOOGLE ADS — audita a conta ao vivo (sem persistir sugestões)
// e só aplica uma ação na API quando o usuário aprova explicitamente no painel.
// ════════════════════════════════════════════════════════════════════════

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

async function buscarCredenciaisGoogle(conexaoId: string): Promise<{ credenciais: CredenciaisGoogle; nome: string } | null> {
  const conexao = await prisma.conexaoAds.findUnique({ where: { id: conexaoId } });
  if (!conexao || conexao.plataforma !== 'google') return null;
  let credenciais: any = {};
  try { credenciais = JSON.parse(conexao.credenciais || '{}'); } catch { credenciais = {}; }
  return { credenciais, nome: conexao.nome };
}

/* ===== AUDITORIA: coleta + regras de diagnóstico, ao vivo ===== */
router.get('/:conexaoId/auditoria', async (req, res) => {
  try {
    const achado = await buscarCredenciaisGoogle(String(req.params.conexaoId));
    if (!achado) return res.status(404).json({ error: 'Conexão Google Ads não encontrada.' });

    const dados = await coletarDados(achado.credenciais);
    const acoes = analisar(dados);
    const resumo = {
      critico: acoes.filter((a) => a.prioridade === 'CRITICO').length,
      alerta: acoes.filter((a) => a.prioridade === 'ALERTA').length,
      sugestao: acoes.filter((a) => a.prioridade === 'SUGESTAO').length,
      economiaEstimadaMes: Math.round(economiaTotal(acoes) * 100) / 100,
      totalCampanhas: dados.campanhas.length,
      totalKeywords: dados.keywords.length,
    };
    res.json({ nome: achado.nome, resumo, acoes });
  } catch (e) { erro(res, e); }
});

/* ===== EXECUTAR 1 AÇÃO APROVADA (nunca em lote) ===== */
router.post('/:conexaoId/executar', async (req, res) => {
  try {
    const conexaoId = String(req.params.conexaoId);
    const achado = await buscarCredenciaisGoogle(conexaoId);
    if (!achado) return res.status(404).json({ error: 'Conexão Google Ads não encontrada.' });

    const acao: AcaoOtimizacao | undefined = req.body?.acao;
    if (!acao || !acao.operacaoApi) return res.status(400).json({ error: 'Ação inválida.' });
    if (acao.operacaoApi !== 'pause_keyword' && acao.operacaoApi !== 'add_negative') {
      return res.status(400).json({ error: 'Esta sugestão exige revisão manual — não há operação automática para aplicar.' });
    }

    const simular = Boolean(req.body?.simular);
    const resultado = await executarAcao(achado.credenciais, acao, simular);

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

/* ===== HISTÓRICO de ações já aplicadas (auditoria) ===== */
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
