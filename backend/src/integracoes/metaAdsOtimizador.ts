// ════════════════════════════════════════════════════════════════════════
// OTIMIZADOR DE META (FACEBOOK) ADS — audita a conta e gerencia campanhas/
// conjuntos com aprovação humana individual (mesmo modelo do Otimizador do Google).
//
// ⚠️ ATENÇÃO DINHEIRO: no Meta o orçamento é em CENTAVOS (×100). No Google é
// em micros (×1.000.000). Copiar o fator errado aqui = gasto catastrófico.
// ════════════════════════════════════════════════════════════════════════

import { CredenciaisMeta, META_GRAPH_VERSION, chamarGraphPost } from './metaAds';
import { AcaoOtimizacao, ResultadoExecucao } from './googleAdsOtimizador';

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const CENTAVOS = 100;

// Objetivos válidos de campanha na Graph API atual (modelo ODAX). Validamos antes de
// enviar para dar um erro claro em vez do erro cru da Meta.
const OBJETIVOS_META = ['OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_ENGAGEMENT', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS', 'OUTCOME_APP_PROMOTION'];
export const OBJETIVOS_META_LABEL: Record<string, string> = {
  OUTCOME_LEADS: 'Leads / Contatos (WhatsApp, formulário)',
  OUTCOME_ENGAGEMENT: 'Engajamento / Mensagens',
  OUTCOME_TRAFFIC: 'Tráfego (visitas ao site)',
  OUTCOME_SALES: 'Vendas / Conversões',
  OUTCOME_AWARENESS: 'Reconhecimento (alcance)',
  OUTCOME_APP_PROMOTION: 'Promoção de aplicativo',
};

// Tipos de ação que contam como LEAD (mesma lista do metaAds — lojas usam muito
// click-to-WhatsApp, então "conversa iniciada" conta como lead).
const TIPOS_ACAO_LEAD = ['lead', 'onsite_conversion.lead_grouped', 'onsite_conversion.messaging_conversation_started_7d'];

function normalizarConta(adAccountId: string): string {
  const limpo = String(adAccountId).trim();
  return limpo.startsWith('act_') ? limpo : `act_${limpo}`;
}

// GET paginado na Graph API (token na query — nunca logar a URL).
async function graphGetPaginado(accessToken: string, path: string, params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  let url: string | null = `${GRAPH_BASE}/${path}?${qs.toString()}`;
  const linhas: any[] = [];
  while (url) {
    const resp = await fetch(url);
    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) throw new Error(json?.error?.message || `Meta Graph respondeu HTTP ${resp.status}`);
    if (Array.isArray(json.data)) linhas.push(...json.data);
    url = json?.paging?.next || null;
  }
  return linhas;
}

function contarLeads(actions: any): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) if (TIPOS_ACAO_LEAD.includes(String(a?.action_type))) total += Number(a?.value ?? 0);
  return Math.round(total);
}

// ─── Tipos coletados ─────────────────────────────────────────────────────

export interface CampanhaMeta {
  id: string;
  nome: string;
  status: string;           // ACTIVE | PAUSED (o que enviamos na escrita)
  effectiveStatus: string;  // pode ser PENDING_REVIEW, DISAPPROVED, etc. (o que mostramos)
  objetivo: string;
  ehCBO: boolean;           // orçamento no nível da campanha (Campaign Budget Optimization)
  budgetDiarioReais: number; // orçamento diário em reais (0 se não for CBO)
  custo30d: number;
  leads30d: number;
  cliques30d: number;
}

export interface ConjuntoMeta {
  id: string;
  nome: string;
  status: string;
  effectiveStatus: string;
  campanhaId: string;
  budgetDiarioReais: number; // orçamento do conjunto em reais (0 se a campanha for CBO)
}

export interface DadosMeta {
  campanhas: CampanhaMeta[];
  conjuntos: ConjuntoMeta[];
}

// ─── Coleta ──────────────────────────────────────────────────────────────

export async function coletarDadosMeta(cred: CredenciaisMeta): Promise<DadosMeta> {
  const conta = normalizarConta(cred.adAccountId);

  const [linhasCamp, linhasAdset, linhasIns] = await Promise.all([
    graphGetPaginado(cred.accessToken, `${conta}/campaigns`, {
      fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
      limit: '200',
    }),
    graphGetPaginado(cred.accessToken, `${conta}/adsets`, {
      fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget',
      limit: '500',
    }),
    graphGetPaginado(cred.accessToken, `${conta}/insights`, {
      level: 'campaign',
      fields: 'campaign_id,spend,impressions,clicks,actions',
      date_preset: 'last_30d',
      limit: '500',
    }),
  ]);

  // Insights por campanha (últimos 30 dias, agregado)
  const insPorCamp: Record<string, { spend: number; leads: number; cliques: number }> = {};
  for (const l of linhasIns) {
    const id = String(l?.campaign_id ?? '');
    if (!id) continue;
    insPorCamp[id] = {
      spend: Number(l?.spend ?? 0),
      leads: contarLeads(l?.actions),
      cliques: Number(l?.clicks ?? 0),
    };
  }

  const campanhas: CampanhaMeta[] = linhasCamp.map((c: any) => {
    // daily_budget/lifetime_budget vêm em CENTAVOS (string). Preenchido no nível da
    // campanha => é CBO (orçamento otimizado na campanha).
    const dailyC = Number(c?.daily_budget ?? 0);
    const lifeC = Number(c?.lifetime_budget ?? 0);
    const ehCBO = dailyC > 0 || lifeC > 0;
    const ins = insPorCamp[String(c?.id ?? '')] || { spend: 0, leads: 0, cliques: 0 };
    return {
      id: String(c?.id ?? ''),
      nome: String(c?.name ?? ''),
      status: String(c?.status ?? ''),
      effectiveStatus: String(c?.effective_status ?? c?.status ?? ''),
      objetivo: String(c?.objective ?? ''),
      ehCBO,
      budgetDiarioReais: dailyC > 0 ? dailyC / CENTAVOS : 0,
      custo30d: Math.round(ins.spend * 100) / 100,
      leads30d: ins.leads,
      cliques30d: ins.cliques,
    };
  });

  const conjuntos: ConjuntoMeta[] = linhasAdset.map((a: any) => {
    const daily = Number(a?.daily_budget ?? 0);
    return {
      id: String(a?.id ?? ''),
      nome: String(a?.name ?? ''),
      status: String(a?.status ?? ''),
      effectiveStatus: String(a?.effective_status ?? a?.status ?? ''),
      campanhaId: String(a?.campaign_id ?? ''),
      budgetDiarioReais: daily > 0 ? daily / CENTAVOS : 0,
    };
  });

  return { campanhas, conjuntos };
}

// ─── Regras de diagnóstico ────────────────────────────────────────────────

const CUSTO_SEM_LEAD = 50.0; // campanha gastou mais que isso e não trouxe lead → alerta

let seq = 0;
const brl = (v: number): string => `R$ ${v.toFixed(2).replace('.', ',').replace(/\d(?=(\d{3})+,)/g, '$&.')}`;
const nova = (a: Omit<AcaoOtimizacao, 'id'>): AcaoOtimizacao => ({ id: `meta-${Date.now()}-${seq++}`, ...a });

export function analisarMeta(dados: DadosMeta): AcaoOtimizacao[] {
  const acoes: AcaoOtimizacao[] = [];
  for (const c of dados.campanhas) {
    if (c.status === 'ACTIVE' && c.custo30d > CUSTO_SEM_LEAD && c.leads30d === 0) {
      acoes.push(nova({
        prioridade: 'ALERTA', categoria: 'ANUNCIOS', entidade: 'campanha',
        entidadeId: c.id, entidadeNome: c.nome,
        problema: `A campanha "${c.nome}" gastou ${brl(c.custo30d)} nos últimos 30 dias e não trouxe nenhum contato/lead. Pode estar mal direcionada ou com criativo fraco.`,
        acao: `Pausar a campanha "${c.nome}" (ou revisar público/criativo)`,
        impactoEsperado: `Parar o gasto de ~${brl(c.custo30d)}/mês que não traz resultado.`,
        dadosAtuais: { custo30d: c.custo30d, leads30d: c.leads30d, cliques30d: c.cliques30d },
        operacaoApi: 'set_status_meta', parametrosApi: { id: c.id, status: 'PAUSED' },
        reversivel: true, economiaEstimada: c.custo30d, regra: 'campanha_sem_lead',
      }));
    }
  }
  return acoes;
}

// Lista unificada para GERENCIAR (pausar/ativar + orçamento). Uma linha por campanha;
// para campanhas SEM CBO, também lista os conjuntos (onde fica o orçamento).
export interface ItemGerenciavel {
  id: string;
  nome: string;
  nivel: 'campanha' | 'conjunto';
  status: string;          // ACTIVE | PAUSED (normalizado p/ o botão)
  effectiveStatus: string;
  custo30d: number | null; // só campanha tem custo agregado aqui
  budgetDiarioReais: number;
  podeEditarOrcamento: boolean; // true = tem orçamento próprio editável neste nível
}

export function montarGerenciaveis(dados: DadosMeta): ItemGerenciavel[] {
  const itens: ItemGerenciavel[] = [];
  const conjuntosPorCamp: Record<string, ConjuntoMeta[]> = {};
  for (const s of dados.conjuntos) (conjuntosPorCamp[s.campanhaId] = conjuntosPorCamp[s.campanhaId] || []).push(s);

  for (const c of dados.campanhas) {
    itens.push({
      id: c.id, nome: c.nome, nivel: 'campanha',
      status: c.status, effectiveStatus: c.effectiveStatus,
      custo30d: c.custo30d,
      budgetDiarioReais: c.budgetDiarioReais,
      // Só edita orçamento diário na campanha se ela tiver orçamento DIÁRIO em CBO.
      // Campanha com orçamento vitalício (lifetime) tem budgetDiarioReais=0 e NÃO deve
      // oferecer edição de daily_budget (o Meta rejeita mudar daily onde há lifetime).
      podeEditarOrcamento: c.budgetDiarioReais > 0,
    });
    // Campanha SEM CBO: o orçamento está nos conjuntos → lista os conjuntos p/ gerenciar.
    if (!c.ehCBO) {
      for (const s of conjuntosPorCamp[c.id] || []) {
        itens.push({
          id: s.id, nome: `↳ ${s.nome}`, nivel: 'conjunto',
          status: s.status, effectiveStatus: s.effectiveStatus,
          custo30d: null,
          budgetDiarioReais: s.budgetDiarioReais,
          podeEditarOrcamento: s.budgetDiarioReais > 0,
        });
      }
    }
  }
  return itens;
}

export function economiaTotalMeta(acoes: AcaoOtimizacao[]): number {
  return acoes.filter((a) => a.operacaoApi !== 'nenhum').reduce((s, a) => s + a.economiaEstimada, 0);
}

// ─── Execução (1 ação aprovada por vez) ────────────────────────────────────

export async function executarAcaoMeta(
  cred: CredenciaisMeta,
  acao: Pick<AcaoOtimizacao, 'operacaoApi' | 'parametrosApi'>,
  simular: boolean,
): Promise<ResultadoExecucao> {
  const p = acao.parametrosApi as any;

  if (acao.operacaoApi === 'set_status_meta') {
    const status = p.status === 'ACTIVE' ? 'ACTIVE' : p.status === 'PAUSED' ? 'PAUSED' : null;
    if (!status) return { success: false, erro: 'Status inválido.' };
    if (!p.id) return { success: false, erro: 'Item não identificado.' };
    if (simular) return { success: true, simulado: true };
    try {
      await chamarGraphPost(cred, String(p.id), { status });
      return { success: true, detalhe: status === 'ACTIVE' ? 'Ativado.' : 'Pausado.' };
    } catch (e: any) { return { success: false, erro: String(e?.message || 'Erro ao aplicar no Facebook.') }; }
  }

  if (acao.operacaoApi === 'update_budget_meta') {
    const reais = Number(p.amountReais);
    if (!Number.isFinite(reais) || reais <= 0 || reais > 100000) {
      return { success: false, erro: 'Orçamento inválido. Informe um valor entre R$ 1,00 e R$ 100.000,00.' };
    }
    if (!p.id) return { success: false, erro: 'Item não identificado.' };
    if (simular) return { success: true, simulado: true };
    try {
      // ⚠️ CENTAVOS: reais × 100 (NÃO × 1.000.000 como no Google).
      await chamarGraphPost(cred, String(p.id), { daily_budget: Math.round(reais * CENTAVOS) });
      return { success: true, detalhe: `Orçamento diário ajustado para ${brl(reais)}.` };
    } catch (e: any) { return { success: false, erro: String(e?.message || 'Erro ao aplicar no Facebook.') }; }
  }

  if (acao.operacaoApi === 'criar_campanha_meta') {
    const nome = String(p.nome ?? '').trim();
    const objetivo = String(p.objetivo ?? '').trim().toUpperCase();
    const temBudget = p.budgetDiarioReais !== undefined && p.budgetDiarioReais !== null && p.budgetDiarioReais !== '';
    const reais = Number(p.budgetDiarioReais);
    if (!nome) return { success: false, erro: 'Informe um nome para a campanha.' };
    if (!OBJETIVOS_META.includes(objetivo)) return { success: false, erro: 'Objetivo inválido. Escolha um objetivo válido do Facebook.' };
    if (temBudget && (!Number.isFinite(reais) || reais <= 0 || reais > 100000)) {
      return { success: false, erro: 'Orçamento inválido. Informe um valor entre R$ 1,00 e R$ 100.000,00.' };
    }
    if (simular) {
      return { success: true, simulado: true, detalhe: `Campanha "${nome}" (${OBJETIVOS_META_LABEL[objetivo] || objetivo}) seria criada como PAUSADA${temBudget ? ` com orçamento de ${brl(reais)}/dia` : ''}.` };
    }
    try {
      const conta = normalizarConta(cred.adAccountId);
      const campos: Record<string, string | number> = {
        name: nome,
        objective: objetivo,
        status: 'PAUSED',              // sempre nasce PAUSADA — nunca gasta sem revisão humana
        special_ad_categories: '[]',   // obrigatório na Graph atual
      };
      if (temBudget) {
        // ⚠️ CENTAVOS (×100). Orçamento no nível da campanha (CBO) exige estratégia de lance.
        campos.daily_budget = Math.round(reais * CENTAVOS);
        campos.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
      }
      const r = await chamarGraphPost(cred, `${conta}/campaigns`, campos);
      const novoId = String((r && (r.id || r?.data?.id)) || '');
      return { success: true, detalhe: `Campanha "${nome}" criada como PAUSADA${novoId ? ` (ID ${novoId})` : ''}. Falta configurar o conjunto (público/orçamento) e o anúncio antes de ativar.` };
    } catch (e: any) {
      return { success: false, erro: String(e?.message || 'Erro ao criar a campanha no Facebook.') };
    }
  }

  return { success: false, erro: `Operação não suportada: ${acao.operacaoApi}` };
}
