// ════════════════════════════════════════════════════════════════════════
// OTIMIZADOR DE GOOGLE ADS — audita a conta e sugere otimizações, cada uma
// só aplicada com aprovação humana explícita (nunca em lote automático).
//
// Porta a lógica original do CLI Python (claude skills/google-ads-manager):
// coleta via GAQL → regras de diagnóstico → ação sugerida → execução (mutate)
// só do que o usuário aprovar no painel. Reaproveita a autenticação e o
// executor de queries já existentes em googleAds.ts (mesmas credenciais da
// tela "Conexões de Anúncios").
// ════════════════════════════════════════════════════════════════════════

import {
  CredenciaisGoogle,
  trocarRefreshPorAccessToken,
  executarBusca,
  executarMutate,
} from './googleAds';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface CampanhaColetada {
  id: string;
  nome: string;
  status: string;
  tipo: string;
  budgetDiario: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpcMedio: number;
  custo: number;
  conversoes: number;
  custoPorConversao: number;
  limitadaPorOrcamento: boolean;
  conversoesHistoricas: number;
  estrategiaLance: string;        // MANUAL_CPC, MAXIMIZE_CONVERSIONS, TARGET_CPA, etc.
  campanhaResourceName: string;   // customers/{cid}/campaigns/{id} — usado nas ações de escrita
  budgetResourceName: string;     // customers/{cid}/campaignBudgets/{id} — usado ao ajustar orçamento
  orcamentoCompartilhado: boolean; // orçamento usado por +de 1 campanha — ajustar afeta TODAS
  orcamentoRefCount: number;       // quantas campanhas usam este mesmo orçamento
}

export interface AdGroupColetado {
  id: string;
  nome: string;
  status: string;
  campanhaId: string;
  campanhaNome: string;
  numKeywords: number;
}

export interface KeywordColetada {
  id: string;
  resourceName: string;
  texto: string;
  matchType: string;
  status: string;
  adGroupId: string;
  adGroupName: string;
  campanhaId: string;
  campanhaNome: string;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpcMedio: number;
  cpcBid: number;   // lance máximo (CPC) manual atual, em reais (0 = sem lance manual/bidding automático)
  custo: number;
  conversoes: number;
  qualityScore: number;
}

export interface AnuncioColetado {
  id: string;
  status: string;
  forca: string;
  titulos: string[];
  descricoes: string[];
  adGroupId: string;
  adGroupNome: string;
  campanhaId: string;
  campanhaNome: string;
}

export interface TermoPesquisaColetado {
  termo: string;
  status: string;
  campanhaId: string;
  campanhaNome: string;
  impressoes: number;
  cliques: number;
  custo: number;
  conversoes: number;
}

export interface DadosColetados {
  campanhas: CampanhaColetada[];
  adGroups: AdGroupColetado[];
  keywords: KeywordColetada[];
  anuncios: AnuncioColetado[];
  termosPesquisa: TermoPesquisaColetado[];
}

export type OperacaoApi =
  | 'pause_keyword'
  | 'add_negative'
  | 'update_bid'
  | 'update_budget'
  | 'set_campaign_status'
  | 'change_match_type'
  | 'add_keyword'
  | 'nenhum';

// Quando presente, a recomendação tem um VALOR editável pelo usuário no painel antes de
// aplicar (ex.: novo lance em R$, novo orçamento diário). O valor final digitado volta no
// campo indicado de parametrosApi (`campoValor`), já convertido de reais quando aplicável.
export interface ValorEditavel {
  tipo: 'moeda';           // por ora só valores em R$
  label: string;           // rótulo do input (ex.: "Novo lance máximo por clique (R$)")
  atual: number;           // valor atual, em reais
  sugerido: number;        // valor sugerido pela regra, em reais (default do input)
  min: number;             // mínimo aceitável em reais (validação)
  campoValor: string;      // nome do campo em parametrosApi que recebe o valor em reais
}

export interface AcaoOtimizacao {
  id: string;
  prioridade: 'CRITICO' | 'ALERTA' | 'SUGESTAO';
  categoria: 'PALAVRAS_CHAVE' | 'LANCES' | 'ESTRUTURA' | 'ANUNCIOS' | 'NEGATIVOS' | 'ORCAMENTO';
  entidade: string;
  entidadeId: string;
  entidadeNome: string;
  problema: string;
  acao: string;
  impactoEsperado: string;
  dadosAtuais: Record<string, unknown>;
  operacaoApi: OperacaoApi;
  parametrosApi: Record<string, unknown>;
  valorEditavel?: ValorEditavel;   // presente só quando o usuário edita um valor antes de aplicar
  reversivel: boolean;
  economiaEstimada: number;
  regra: string;
}

// ─── Coleta (GAQL) ──────────────────────────────────────────────────────────

const MICROS = 1_000_000;
const microsToReais = (v: unknown): number => Number(v || 0) / MICROS;

const CAMPAIGN_QUERY = `
  SELECT
    campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
    campaign.resource_name, campaign.bidding_strategy_type,
    campaign_budget.amount_micros, campaign_budget.resource_name,
    campaign_budget.explicitly_shared, campaign_budget.reference_count,
    metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
    metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion,
    metrics.search_budget_lost_impression_share
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC
`;

const AD_GROUP_QUERY = `
  SELECT
    ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name,
    metrics.impressions, metrics.clicks, metrics.cost_micros
  FROM ad_group
  WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
  ORDER BY metrics.cost_micros DESC
`;

const KEYWORD_QUERY = `
  SELECT
    ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type, ad_group_criterion.status,
    ad_group_criterion.cpc_bid_micros,
    ad_group.id, ad_group.name, campaign.id, campaign.name,
    metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc,
    metrics.cost_micros, metrics.conversions,
    ad_group_criterion.quality_info.quality_score
  FROM keyword_view
  WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED' AND ad_group.status = 'ENABLED'
  ORDER BY metrics.cost_micros DESC
`;

const AD_QUERY = `
  SELECT
    ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad_strength,
    ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
    ad_group.id, ad_group.name, campaign.id, campaign.name
  FROM ad_group_ad
  WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
`;

const SEARCH_TERMS_QUERY = `
  SELECT
    search_term_view.search_term, search_term_view.status,
    campaign.id, campaign.name,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
  FROM search_term_view
  WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC
  LIMIT 200
`;

const MATCH_TYPE_LABEL: Record<string, string> = { EXACT: 'exata', PHRASE: 'frase', BROAD: 'ampla' };

export async function coletarDados(credenciais: CredenciaisGoogle): Promise<DadosColetados> {
  const accessToken = await trocarRefreshPorAccessToken(credenciais);
  const customerId = credenciais.customerId.replace(/\D/g, '');

  const [linhasCamp, linhasGrupo, linhasKw, linhasAd, linhasTermo] = await Promise.all([
    executarBusca(credenciais, accessToken, CAMPAIGN_QUERY),
    executarBusca(credenciais, accessToken, AD_GROUP_QUERY),
    executarBusca(credenciais, accessToken, KEYWORD_QUERY),
    executarBusca(credenciais, accessToken, AD_QUERY),
    executarBusca(credenciais, accessToken, SEARCH_TERMS_QUERY),
  ]);

  const campanhas: CampanhaColetada[] = linhasCamp.map((row: any) => {
    const m = row?.metrics || {};
    return {
      id: String(row?.campaign?.id ?? ''),
      nome: String(row?.campaign?.name ?? ''),
      status: String(row?.campaign?.status ?? ''),
      tipo: String(row?.campaign?.advertisingChannelType ?? ''),
      budgetDiario: microsToReais(row?.campaignBudget?.amountMicros),
      impressoes: Number(m.impressions || 0),
      cliques: Number(m.clicks || 0),
      ctr: Number(m.ctr || 0) * 100,
      cpcMedio: microsToReais(m.averageCpc),
      custo: microsToReais(m.costMicros),
      conversoes: Number(m.conversions || 0),
      custoPorConversao: microsToReais(m.costPerConversion),
      limitadaPorOrcamento: Number(m.searchBudgetLostImpressionShare || 0) > 0.05,
      conversoesHistoricas: 0, // a API não expõe histórico "vitalício" numa única query simples
      estrategiaLance: String(row?.campaign?.biddingStrategyType ?? ''),
      campanhaResourceName: String(row?.campaign?.resourceName ?? `customers/${customerId}/campaigns/${row?.campaign?.id ?? ''}`),
      budgetResourceName: String(row?.campaignBudget?.resourceName ?? ''),
      orcamentoCompartilhado: Boolean(row?.campaignBudget?.explicitlyShared) || Number(row?.campaignBudget?.referenceCount ?? 0) > 1,
      orcamentoRefCount: Number(row?.campaignBudget?.referenceCount ?? 0),
    };
  });

  const adGroups: AdGroupColetado[] = linhasGrupo.map((row: any) => ({
    id: String(row?.adGroup?.id ?? ''),
    nome: String(row?.adGroup?.name ?? ''),
    status: String(row?.adGroup?.status ?? ''),
    campanhaId: String(row?.campaign?.id ?? ''),
    campanhaNome: String(row?.campaign?.name ?? ''),
    numKeywords: 0, // preenchido abaixo, contando as keywords coletadas
  }));

  const keywords: KeywordColetada[] = linhasKw.map((row: any) => {
    const m = row?.metrics || {};
    const crit = row?.adGroupCriterion || {};
    const adGroupId = String(row?.adGroup?.id ?? '');
    const criterionId = String(crit.criterionId ?? '');
    const matchTypeRaw = String(crit.keyword?.matchType ?? '');
    return {
      id: criterionId,
      resourceName: `customers/${customerId}/adGroupCriteria/${adGroupId}~${criterionId}`,
      texto: String(crit.keyword?.text ?? ''),
      matchType: MATCH_TYPE_LABEL[matchTypeRaw] || 'ampla',
      status: String(crit.status ?? ''),
      adGroupId,
      adGroupName: String(row?.adGroup?.name ?? ''),
      campanhaId: String(row?.campaign?.id ?? ''),
      campanhaNome: String(row?.campaign?.name ?? ''),
      impressoes: Number(m.impressions || 0),
      cliques: Number(m.clicks || 0),
      ctr: Number(m.ctr || 0) * 100,
      cpcMedio: microsToReais(m.averageCpc),
      cpcBid: microsToReais(crit.cpcBidMicros),
      custo: microsToReais(m.costMicros),
      conversoes: Number(m.conversions || 0),
      qualityScore: Number(crit.qualityInfo?.qualityScore || 0),
    };
  });

  const contagemPorGrupo: Record<string, number> = {};
  for (const kw of keywords) {
    if (kw.status === 'ENABLED') contagemPorGrupo[kw.adGroupId] = (contagemPorGrupo[kw.adGroupId] || 0) + 1;
  }
  for (const ag of adGroups) ag.numKeywords = contagemPorGrupo[ag.id] || 0;

  const anuncios: AnuncioColetado[] = linhasAd.map((row: any) => {
    const ad = row?.adGroupAd || {};
    const rsa = ad?.ad?.responsiveSearchAd;
    const titulos: string[] = Array.isArray(rsa?.headlines) ? rsa.headlines.map((h: any) => String(h?.text ?? '')) : [];
    const descricoes: string[] = Array.isArray(rsa?.descriptions) ? rsa.descriptions.map((d: any) => String(d?.text ?? '')) : [];
    return {
      id: String(ad?.ad?.id ?? ''),
      status: String(ad?.status ?? ''),
      forca: String(ad?.adStrength ?? 'DESCONHECIDA'),
      titulos,
      descricoes,
      adGroupId: String(row?.adGroup?.id ?? ''),
      adGroupNome: String(row?.adGroup?.name ?? ''),
      campanhaId: String(row?.campaign?.id ?? ''),
      campanhaNome: String(row?.campaign?.name ?? ''),
    };
  });

  const termosPesquisa: TermoPesquisaColetado[] = linhasTermo.map((row: any) => {
    const m = row?.metrics || {};
    const stv = row?.searchTermView || {};
    return {
      termo: String(stv.searchTerm ?? ''),
      status: String(stv.status ?? ''),
      campanhaId: String(row?.campaign?.id ?? ''),
      campanhaNome: String(row?.campaign?.name ?? ''),
      impressoes: Number(m.impressions || 0),
      cliques: Number(m.clicks || 0),
      custo: microsToReais(m.costMicros),
      conversoes: Number(m.conversions || 0),
    };
  });

  return { campanhas, adGroups, keywords, anuncios, termosPesquisa };
}

// ─── Regras de diagnóstico (porta o analyzer.py) ───────────────────────────

const CUSTO_ZERO_CLIQUE = 50.0;
const CUSTO_ZERO_CONV = 100.0;
const CTR_MIN = 0.5;
const IMPRESSOES_MIN_CTR = 500;
const QS_CRITICO = 3;
const QS_CRITICO_CUSTO = 30.0;
const QS_ALERTA = 5;
const QS_ALERTA_CUSTO = 50.0;
const BROAD_BUDGET_SHARE = 0.4;
const CPC_ALTO_SETOR = 8.0;
const GRUPO_MAX_KEYWORDS = 20;
const TERMO_CUSTO_NEGATIVA = 20.0;

const PALAVRAS_IRRELEVANTES = [
  'tênis', 'tenis', 'sapato', 'sapatos', 'bicicleta', 'bike', 'vídeo', 'video',
  'como fazer', 'em casa', 'caseiro', 'remendar', 'gratis', 'grátis', 'download',
  'calçado', 'calcado', 'roupa', 'celular', 'emprego', 'vaga', 'curso',
];

const isIrrelevante = (termo: string): boolean => {
  const t = termo.toLowerCase();
  return PALAVRAS_IRRELEVANTES.some((p) => t.includes(p));
};

const brl = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',').replace(/\d(?=(\d{3})+,)/g, '$&.')}`;

let seq = 0;
const novaAcao = (a: Omit<AcaoOtimizacao, 'id'>): AcaoOtimizacao => ({ id: `acao-${Date.now()}-${seq++}`, ...a });

// Só faz sentido editar o LANCE (CPC) manual em campanhas de lance manual. Em campanhas
// com lance automático (Maximize Conversions, Target CPA...) o Google ignora/rejeita lance
// por palavra, então nesses casos a recomendação de CPC alto fica só como revisão manual.
const LANCE_MANUAL = new Set(['MANUAL_CPC', 'ENHANCED_CPC']);
const CUSTO_MIN_TROCAR_MATCH = 30.0; // ampla sem conversão acima disso → oferece trocar p/ frase

function checarKeywords(keywords: KeywordColetada[], temConversao: boolean, campanhaPorId: Map<string, CampanhaColetada>): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];
  for (const kw of keywords) {
    if (kw.status !== 'ENABLED') continue;
    const nome = `"${kw.texto}" (${kw.matchType})`;
    let gerouPause = false;

    if (kw.custo > CUSTO_ZERO_CLIQUE && kw.cliques === 0) {
      acoes.push(novaAcao({
        prioridade: 'CRITICO', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `Essa palavra-chave gastou ${brl(kw.custo)} nos últimos 30 dias mas não gerou nenhum clique. O anúncio aparece para pesquisas que ninguém clica — é dinheiro indo embora.`,
        acao: `Pausar a palavra-chave ${nome}`,
        impactoEsperado: `Economia de cerca de ${brl(kw.custo)}/mês, que pode ir para palavras que estão funcionando.`,
        dadosAtuais: { custo30d: kw.custo, cliques: kw.cliques, impressoes: kw.impressoes },
        operacaoApi: 'pause_keyword', parametrosApi: { resourceName: kw.resourceName },
        reversivel: true, economiaEstimada: kw.custo, regra: 'custo_zero_clique',
      }));
      gerouPause = true;
    } else if (temConversao && kw.custo > CUSTO_ZERO_CONV && kw.conversoes === 0) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `Gastou ${brl(kw.custo)} e teve ${kw.cliques} cliques, mas nenhuma conversão. O clique vem, mas não vira cliente.`,
        acao: `Pausar a palavra-chave ${nome} (ou revisar a página de destino)`,
        impactoEsperado: `Parar o gasto de ${brl(kw.custo)}/mês que não traz resultado.`,
        dadosAtuais: { custo30d: kw.custo, cliques: kw.cliques, conversoes: kw.conversoes },
        operacaoApi: 'pause_keyword', parametrosApi: { resourceName: kw.resourceName },
        reversivel: true, economiaEstimada: kw.custo, regra: 'custo_zero_conversao',
      }));
      gerouPause = true;
    }

    if (!gerouPause && kw.ctr < CTR_MIN && kw.impressoes > IMPRESSOES_MIN_CTR) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `Apareceu ${kw.impressoes.toLocaleString('pt-BR')} vezes mas quase ninguém clicou (taxa de cliques de apenas ${kw.ctr.toFixed(2)}%). Isso indica que o anúncio não combina com o que a pessoa pesquisou.`,
        acao: `Pausar ou revisar a palavra-chave ${nome}`,
        impactoEsperado: 'Menos aparições inúteis e melhora na qualidade média da conta.',
        dadosAtuais: { ctr: kw.ctr, impressoes: kw.impressoes, cliques: kw.cliques, custo30d: kw.custo },
        operacaoApi: 'pause_keyword', parametrosApi: { resourceName: kw.resourceName },
        reversivel: true, economiaEstimada: kw.custo * 0.3, regra: 'ctr_baixo',
      }));
    }

    if (kw.qualityScore > 0 && kw.qualityScore <= QS_CRITICO && kw.custo > QS_CRITICO_CUSTO) {
      acoes.push(novaAcao({
        prioridade: 'CRITICO', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `O índice de qualidade (nota que o Google dá de 1 a 10 para a relevância do anúncio) está em ${kw.qualityScore}/10 — muito baixo. Isso encarece cada clique e prejudica toda a conta.`,
        acao: `Destacar ${nome} para revisão do texto do anúncio e da página de destino`,
        impactoEsperado: 'Subir o índice de qualidade reduz o custo por clique e melhora o posicionamento sem gastar mais.',
        dadosAtuais: { qualityScore: kw.qualityScore, custo30d: kw.custo, ctr: kw.ctr },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: 0, regra: 'qs_critico',
      }));
    } else if (kw.qualityScore > 0 && kw.qualityScore <= QS_ALERTA && kw.custo > QS_ALERTA_CUSTO) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `O índice de qualidade está em ${kw.qualityScore}/10 (o ideal é 7 ou mais). Cada clique sai mais caro do que precisaria.`,
        acao: `Sugerir melhoria de relevância para ${nome}`,
        impactoEsperado: 'Reduzir o custo por clique melhorando a relevância.',
        dadosAtuais: { qualityScore: kw.qualityScore, custo30d: kw.custo },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: 0, regra: 'qs_alerta',
      }));
    }

    // Lance (CPC) alto para o setor — editável só em campanhas de lance manual
    if (kw.cpcMedio > CPC_ALTO_SETOR && kw.cliques > 0) {
      const camp = campanhaPorId.get(kw.campanhaId);
      const manual = camp ? LANCE_MANUAL.has(camp.estrategiaLance) : false;
      // Sugestão de novo lance: teto do setor, mas nunca acima do lance atual (só reduzir).
      const lanceAtual = kw.cpcBid > 0 ? kw.cpcBid : kw.cpcMedio;
      const sugerido = Math.max(0.5, Math.min(CPC_ALTO_SETOR, Math.round(lanceAtual * 0.8 * 100) / 100));
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'LANCES', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: `"${kw.texto}"`,
        problema: `O custo médio por clique dessa palavra está em ${brl(kw.cpcMedio)}, bem acima do normal (cerca de ${brl(CPC_ALTO_SETOR)}). Você está pagando caro por cada visita.`,
        acao: manual
          ? `Reduzir o lance máximo de "${kw.texto}"`
          : `Revisar o lance de "${kw.texto}" (campanha usa lance automático — ajuste pela estratégia da campanha)`,
        impactoEsperado: 'Pagar menos por clique mantendo um volume parecido de visitas.',
        dadosAtuais: { cpcMedio: kw.cpcMedio, lanceAtual, cliques: kw.cliques, custo30d: kw.custo },
        operacaoApi: manual ? 'update_bid' : 'nenhum',
        parametrosApi: manual ? { resourceName: kw.resourceName, cpcBidReais: sugerido } : {},
        ...(manual ? { valorEditavel: { tipo: 'moeda' as const, label: 'Novo lance máximo por clique (R$)', atual: lanceAtual, sugerido, min: 0.01, campoValor: 'cpcBidReais' } } : {}),
        reversivel: true, economiaEstimada: 0, regra: 'cpc_alto',
      }));
    }

    // Correspondência ampla gastando sem converter → oferece trocar para FRASE (mais controle).
    // Reversível, mas RECRIA a palavra (perde o histórico dela) — deixado claro no texto.
    if (kw.matchType === 'ampla' && kw.custo > CUSTO_MIN_TROCAR_MATCH && kw.conversoes === 0) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'PALAVRAS_CHAVE', entidade: 'palavra-chave',
        entidadeId: kw.id, entidadeNome: nome,
        problema: `A palavra ${nome} é de correspondência AMPLA (o Google decide para quais pesquisas mostrar) e gastou ${brl(kw.custo)} sem nenhuma conversão. Trocar para FRASE dá mais controle.`,
        acao: `Trocar "${kw.texto}" de ampla para correspondência de frase`,
        impactoEsperado: 'Mostrar o anúncio só para pesquisas mais próximas do que você vende, cortando desperdício.',
        dadosAtuais: { matchAtual: kw.matchType, custo30d: kw.custo, cliques: kw.cliques, conversoes: kw.conversoes },
        // Recria a palavra em modo frase: remove a antiga + cria a nova no mesmo grupo/lance.
        operacaoApi: 'change_match_type',
        parametrosApi: { oldResourceName: kw.resourceName, adGroupId: kw.adGroupId, texto: kw.texto, novoMatchType: 'PHRASE', cpcBidReais: kw.cpcBid > 0 ? kw.cpcBid : 0 },
        reversivel: true, economiaEstimada: kw.custo * 0.4, regra: 'trocar_match_ampla',
      }));
    }
  }
  return acoes;
}

function checarBroadMatch(keywords: KeywordColetada[], campanhas: CampanhaColetada[]): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];
  const custoPorCamp: Record<string, number> = {};
  for (const c of campanhas) custoPorCamp[c.id] = c.custo;

  const broadSemConv: Record<string, number> = {};
  for (const kw of keywords) {
    if (kw.status === 'ENABLED' && kw.matchType === 'ampla' && kw.conversoes === 0) {
      broadSemConv[kw.campanhaId] = (broadSemConv[kw.campanhaId] || 0) + kw.custo;
    }
  }

  for (const [campId, custoBroad] of Object.entries(broadSemConv)) {
    const custoTotal = custoPorCamp[campId] || 0;
    if (custoTotal <= 0) continue;
    const share = custoBroad / custoTotal;
    if (share > BROAD_BUDGET_SHARE) {
      const campNome = campanhas.find((c) => c.id === campId)?.nome || campId;
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'PALAVRAS_CHAVE', entidade: 'campanha',
        entidadeId: campId, entidadeNome: campNome,
        problema: `Na campanha '${campNome}', as palavras de correspondência ampla (que deixam o Google escolher para quais pesquisas mostrar, com pouco controle) consomem ${(share * 100).toFixed(0)}% do gasto e não trouxeram conversão. ${brl(custoBroad)} sem retorno claro.`,
        acao: 'Mudar essas palavras para correspondência de frase ou exata (mais controle)',
        impactoEsperado: 'Mostrar os anúncios só para pesquisas realmente relevantes, reduzindo desperdício.',
        dadosAtuais: { custoAmplaSemConversao: custoBroad, percentualDoGasto: `${(share * 100).toFixed(0)}%` },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: custoBroad * 0.5, regra: 'broad_sem_controle',
      }));
    }
  }
  return acoes;
}

function checarTermosPesquisa(termos: TermoPesquisaColetado[], campanhas: CampanhaColetada[]): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];
  const campMap: Record<string, string> = {};
  for (const c of campanhas) campMap[c.id] = c.nome;

  for (const st of termos) {
    if (st.status === 'EXCLUDED' || st.status === 'ADDED_EXCLUDED') continue;
    // Segurança: só age sobre termos de campanhas ativas (evita gerar negativa
    // para uma campanha removida/arquivada que não está no mapa analisado).
    if (!(st.campanhaId in campMap)) continue;

    const campNome = campMap[st.campanhaId] || st.campanhaNome;
    const irrelevante = isIrrelevante(st.termo);

    if (irrelevante && st.cliques > 0) {
      acoes.push(novaAcao({
        prioridade: 'CRITICO', categoria: 'NEGATIVOS', entidade: 'termo',
        entidadeId: st.termo, entidadeNome: `"${st.termo}"`,
        problema: `A pesquisa "${st.termo}" acionou seu anúncio e gerou ${st.cliques} clique(s) custando ${brl(st.custo)}. Esse termo não tem nada a ver com o que você vende — é dinheiro jogado fora.`,
        acao: `Adicionar "${st.termo}" como palavra-chave negativa na campanha "${campNome}"`,
        impactoEsperado: `Impedir que esse tipo de pesquisa gaste seu orçamento de novo. Economia de ~${brl(st.custo)}/mês.`,
        dadosAtuais: { custo30d: st.custo, cliques: st.cliques, conversoes: st.conversoes },
        operacaoApi: 'add_negative', parametrosApi: { campaignId: st.campanhaId, texto: st.termo, matchType: 'PHRASE' },
        reversivel: true, economiaEstimada: st.custo, regra: 'termo_irrelevante',
      }));
    } else if (st.custo > TERMO_CUSTO_NEGATIVA && st.conversoes === 0 && st.cliques > 0) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'NEGATIVOS', entidade: 'termo',
        entidadeId: st.termo, entidadeNome: `"${st.termo}"`,
        problema: `A pesquisa "${st.termo}" gastou ${brl(st.custo)} sem gerar nenhuma conversão. Pode estar fora do que você quer vender.`,
        acao: `Avaliar adicionar "${st.termo}" como palavra-chave negativa`,
        impactoEsperado: `Cortar gasto sem retorno (~${brl(st.custo)}/mês) se o termo não for relevante.`,
        dadosAtuais: { custo30d: st.custo, cliques: st.cliques, conversoes: st.conversoes },
        operacaoApi: 'add_negative', parametrosApi: { campaignId: st.campanhaId, texto: st.termo, matchType: 'PHRASE' },
        reversivel: true, economiaEstimada: st.custo, regra: 'termo_custo_sem_conversao',
      }));
    }
  }
  return acoes;
}

function checarEstrutura(adGroups: AdGroupColetado[], anuncios: AnuncioColetado[]): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];

  for (const ag of adGroups) {
    if (ag.status !== 'ENABLED') continue;
    if (ag.numKeywords > GRUPO_MAX_KEYWORDS) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'ESTRUTURA', entidade: 'grupo',
        entidadeId: ag.id, entidadeNome: ag.nome,
        problema: `O grupo '${ag.nome}' tem ${ag.numKeywords} palavras-chave. Grupos muito grandes misturam temas diferentes, e aí o anúncio não fala diretamente com cada pesquisa.`,
        acao: `Dividir o grupo '${ag.nome}' em grupos menores por tema`,
        impactoEsperado: 'Anúncios mais específicos = mais cliques e melhor qualidade.',
        dadosAtuais: { numPalavrasChave: ag.numKeywords },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: 0, regra: 'grupo_inchado',
      }));
    }
  }

  const adsPorGrupo: Record<string, AnuncioColetado[]> = {};
  for (const ad of anuncios) {
    if (ad.status === 'ENABLED') (adsPorGrupo[ad.adGroupId] = adsPorGrupo[ad.adGroupId] || []).push(ad);
  }
  for (const ag of adGroups) {
    if (ag.status !== 'ENABLED') continue;
    const grupoAds = adsPorGrupo[ag.id] || [];
    if (grupoAds.length === 1) {
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'ESTRUTURA', entidade: 'grupo',
        entidadeId: ag.id, entidadeNome: ag.nome,
        problema: `O grupo '${ag.nome}' tem só 1 anúncio ativo. Sem um segundo anúncio para comparar, não dá pra saber qual texto funciona melhor.`,
        acao: `Criar um segundo anúncio no grupo '${ag.nome}' para teste A/B`,
        impactoEsperado: 'O Google testa os dois e mostra mais o que tiver melhor resultado.',
        dadosAtuais: { anunciosAtivos: grupoAds.length },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: 0, regra: 'sem_ab_test',
      }));
    }
  }

  for (const ad of anuncios) {
    if (ad.status !== 'ENABLED') continue;
    if (ad.forca === 'POOR' || ad.forca === 'AVERAGE') {
      const forcaPt = ad.forca === 'POOR' ? 'Ruim' : 'Regular';
      acoes.push(novaAcao({
        prioridade: 'SUGESTAO', categoria: 'ANUNCIOS', entidade: 'anuncio',
        entidadeId: ad.id, entidadeNome: `Anúncio do grupo '${ad.adGroupNome}'`,
        problema: `A 'força do anúncio' (medida do Google de quão completo e relevante ele é) está como '${forcaPt}'. Anúncios mais fortes aparecem mais e custam menos.`,
        acao: 'Adicionar mais títulos e descrições variados ao anúncio',
        impactoEsperado: 'Aumentar a força melhora alcance e reduz custo por clique.',
        dadosAtuais: { forcaAtual: forcaPt, numTitulos: ad.titulos.length, numDescricoes: ad.descricoes.length },
        operacaoApi: 'nenhum', parametrosApi: {},
        reversivel: true, economiaEstimada: 0, regra: 'anuncio_fraco',
      }));
    }
  }

  return acoes;
}

function checarOrcamento(campanhas: CampanhaColetada[]): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];
  for (const c of campanhas) {
    if (c.status === 'ENABLED' && c.limitadaPorOrcamento) {
      const podeEditar = !!c.budgetResourceName; // sem resource name não dá pra escrever o orçamento
      const sugerido = Math.max(1, Math.round(c.budgetDiario * 1.3 * 100) / 100); // +30%
      // ⚠️ Orçamento COMPARTILHADO: mexer aqui muda o orçamento de TODAS as campanhas que
      // usam este mesmo orçamento — o usuário PRECISA ver isso antes de aprovar (achado C1).
      const avisoCompart = c.orcamentoCompartilhado
        ? ` ⚠️ ATENÇÃO: este orçamento é COMPARTILHADO por ${c.orcamentoRefCount} campanhas — alterá-lo muda o orçamento de todas elas, não só desta.`
        : '';
      acoes.push(novaAcao({
        prioridade: 'ALERTA', categoria: 'ORCAMENTO', entidade: 'campanha',
        entidadeId: c.id, entidadeNome: c.nome,
        problema: `A campanha '${c.nome}' está 'limitada por orçamento' — ela poderia aparecer mais, mas o dinheiro do dia acaba antes. Você está perdendo pesquisas de quem quer comprar.${avisoCompart}`,
        acao: podeEditar ? `Aumentar o orçamento diário de '${c.nome}'` : 'Avaliar aumentar o orçamento diário',
        impactoEsperado: c.orcamentoCompartilhado
          ? `Capturar mais pesquisas relevantes. Lembre: afeta as ${c.orcamentoRefCount} campanhas que dividem este orçamento.`
          : 'Capturar mais pesquisas relevantes que hoje ficam de fora.',
        dadosAtuais: { budgetDiario: c.budgetDiario, orcamentoCompartilhado: c.orcamentoCompartilhado, conversoes: c.conversoes, custoPorConversao: c.custoPorConversao },
        operacaoApi: podeEditar ? 'update_budget' : 'nenhum',
        parametrosApi: podeEditar ? { budgetResourceName: c.budgetResourceName, amountReais: sugerido } : {},
        ...(podeEditar ? { valorEditavel: { tipo: 'moeda' as const, label: 'Novo orçamento diário (R$)', atual: c.budgetDiario, sugerido, min: 1, campoValor: 'amountReais' } } : {}),
        reversivel: true, economiaEstimada: 0, regra: 'limitada_por_orcamento',
      }));
    }
  }
  return acoes;
}

const PRIORIDADE_ORDEM: Record<string, number> = { CRITICO: 0, ALERTA: 1, SUGESTAO: 2 };

export function analisar(dados: DadosColetados): AcaoOtimizacao[] {
  const temConversao = dados.campanhas.some((c) => c.conversoes > 0);
  const campanhaPorId = new Map<string, CampanhaColetada>();
  for (const c of dados.campanhas) campanhaPorId.set(c.id, c);
  const acoes: AcaoOtimizacao[] = [
    ...checarKeywords(dados.keywords, temConversao, campanhaPorId),
    ...checarBroadMatch(dados.keywords, dados.campanhas),
    ...checarTermosPesquisa(dados.termosPesquisa, dados.campanhas),
    ...checarEstrutura(dados.adGroups, dados.anuncios),
    ...checarOrcamento(dados.campanhas),
  ];
  acoes.sort((a, b) => (PRIORIDADE_ORDEM[a.prioridade] ?? 3) - (PRIORIDADE_ORDEM[b.prioridade] ?? 3));
  return acoes;
}

export function economiaTotal(acoes: AcaoOtimizacao[]): number {
  return acoes.filter((a) => a.operacaoApi !== 'nenhum').reduce((soma, a) => soma + a.economiaEstimada, 0);
}

// ─── Execução (aplicação de UMA ação aprovada) ─────────────────────────────
// Nunca chamada em lote — só 1 ação por requisição, sempre após clique
// explícito de "Aprovar e aplicar" no painel (equivalente ao "digite S" do CLI).

export interface ResultadoExecucao {
  success: boolean;
  simulado?: boolean;
  detalhe?: string;
  erro?: string;
}

export async function executarAcao(
  credenciais: CredenciaisGoogle,
  acao: Pick<AcaoOtimizacao, 'operacaoApi' | 'parametrosApi'>,
  simular: boolean,
): Promise<ResultadoExecucao> {
  if (acao.operacaoApi === 'nenhum') {
    return { success: false, erro: 'Esta sugestão exige revisão manual — não há operação automática para aplicar.' };
  }

  if (simular) return { success: true, simulado: true };

  try {
    const accessToken = await trocarRefreshPorAccessToken(credenciais);
    const p = acao.parametrosApi as any;

    if (acao.operacaoApi === 'pause_keyword') {
      await executarMutate(credenciais, accessToken, 'adGroupCriteria', {
        updateMask: 'status',
        update: { resourceName: p.resourceName, status: 'PAUSED' },
      });
      return { success: true, detalhe: 'Palavra-chave pausada.' };
    }

    if (acao.operacaoApi === 'add_negative') {
      const customerId = credenciais.customerId.replace(/\D/g, '');
      await executarMutate(credenciais, accessToken, 'campaignCriteria', {
        create: {
          campaign: `customers/${customerId}/campaigns/${p.campaignId}`,
          negative: true,
          keyword: { text: p.texto, matchType: p.matchType || 'PHRASE' },
        },
      });
      return { success: true, detalhe: 'Palavra-chave negativa adicionada.' };
    }

    if (acao.operacaoApi === 'update_bid') {
      const reais = Number(p.cpcBidReais);
      if (!Number.isFinite(reais) || reais <= 0 || reais > 1000) {
        return { success: false, erro: 'Lance inválido. Informe um valor entre R$ 0,01 e R$ 1.000,00.' };
      }
      if (!p.resourceName) return { success: false, erro: 'Palavra-chave não identificada.' };
      await executarMutate(credenciais, accessToken, 'adGroupCriteria', {
        updateMask: 'cpcBidMicros',
        update: { resourceName: p.resourceName, cpcBidMicros: Math.round(reais * MICROS) },
      });
      return { success: true, detalhe: `Lance ajustado para ${brl(reais)}.` };
    }

    if (acao.operacaoApi === 'update_budget') {
      const reais = Number(p.amountReais);
      if (!Number.isFinite(reais) || reais <= 0 || reais > 100000) {
        return { success: false, erro: 'Orçamento inválido. Informe um valor entre R$ 1,00 e R$ 100.000,00.' };
      }
      if (!p.budgetResourceName) return { success: false, erro: 'Orçamento da campanha não identificado.' };
      await executarMutate(credenciais, accessToken, 'campaignBudgets', {
        updateMask: 'amountMicros',
        update: { resourceName: p.budgetResourceName, amountMicros: Math.round(reais * MICROS) },
      });
      return { success: true, detalhe: `Orçamento diário ajustado para ${brl(reais)}.` };
    }

    if (acao.operacaoApi === 'set_campaign_status') {
      const status = p.status === 'ENABLED' ? 'ENABLED' : p.status === 'PAUSED' ? 'PAUSED' : null;
      if (!status) return { success: false, erro: 'Status inválido.' };
      if (!p.campaignResourceName) return { success: false, erro: 'Campanha não identificada.' };
      await executarMutate(credenciais, accessToken, 'campaigns', {
        updateMask: 'status',
        update: { resourceName: p.campaignResourceName, status },
      });
      return { success: true, detalhe: status === 'ENABLED' ? 'Campanha reativada.' : 'Campanha pausada.' };
    }

    if (acao.operacaoApi === 'change_match_type') {
      const customerId = credenciais.customerId.replace(/\D/g, '');
      const novoMatch = ['PHRASE', 'EXACT', 'BROAD'].includes(p.novoMatchType) ? p.novoMatchType : 'PHRASE';
      if (!p.oldResourceName || !p.adGroupId || !p.texto) {
        return { success: false, erro: 'Dados insuficientes para trocar a correspondência.' };
      }
      const create: Record<string, unknown> = {
        adGroup: `customers/${customerId}/adGroups/${p.adGroupId}`,
        status: 'ENABLED',
        keyword: { text: p.texto, matchType: novoMatch },
      };
      const bid = Number(p.cpcBidReais);
      if (Number.isFinite(bid) && bid > 0) create.cpcBidMicros = Math.round(bid * MICROS);
      // Remove a antiga + cria a nova numa só chamada atômica.
      await executarMutate(credenciais, accessToken, 'adGroupCriteria', [
        { remove: p.oldResourceName },
        { create },
      ]);
      return { success: true, detalhe: 'Correspondência trocada (palavra recriada em modo frase/exata).' };
    }

    return { success: false, erro: `Operação não suportada: ${acao.operacaoApi}` };
  } catch (e: any) {
    return { success: false, erro: traduzirErroGoogle(String(e?.message || 'Erro ao aplicar a ação na Google Ads API.')) };
  }
}

// Traduz erros comuns da Google Ads API para português claro (o cru é técnico demais).
function traduzirErroGoogle(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('duplicate')) return 'Já existe uma palavra-chave igual (nesse modo) nesse grupo — nada foi alterado.';
  if (m.includes('budget') && m.includes('shared')) return 'Este orçamento é compartilhado por outras campanhas. A alteração afeta todas elas.';
  if (m.includes('permission') || m.includes('not authorized') || m.includes('unauthorized')) return 'Sem permissão para alterar esta conta. Verifique o acesso da conexão.';
  if (m.includes('invalid') && m.includes('bid')) return 'Lance inválido para esta campanha (pode usar lance automático — ajuste pela estratégia da campanha).';
  return msg;
}
