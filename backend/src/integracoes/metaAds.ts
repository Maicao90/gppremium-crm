import { MetricaCampanhaDia, ResultadoTeste, periodoDias } from './tipos';

// ════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO META ADS (Graph API — Facebook/Instagram)
// ════════════════════════════════════════════════════════════════════════
// O Meta DESATIVA versões antigas da Graph API ~2 anos após o lançamento.
// Se as chamadas começarem a falhar com erro de versão descontinuada,
// basta atualizar a constante abaixo para a versão vigente (ex.: 'v24.0').
// Changelog: https://developers.facebook.com/docs/graph-api/changelog
export const META_GRAPH_VERSION = 'v23.0';

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Credenciais esperadas para a plataforma 'meta'
// adAccountId no formato act_123456789
export interface CredenciaisMeta {
  accessToken: string;
  adAccountId: string;
}

// Tipos de ação que contamos como LEAD.
// Lojas de pneu usam muito anúncio Click-to-WhatsApp: a "conversa iniciada"
// (messaging_conversation_started_7d) conta como lead, além do lead form clássico.
const TIPOS_ACAO_LEAD = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
];

// Valida a presença dos campos obrigatórios (nunca loga os valores)
function validarCredenciais(c: any): string | null {
  const obrigatorios = ['accessToken', 'adAccountId'];
  const faltando = obrigatorios.filter((k) => !c || typeof c[k] !== 'string' || !c[k].trim());
  if (faltando.length > 0) return `Credenciais Meta incompletas: falta ${faltando.join(', ')}`;
  return null;
}

// Garante o prefixo act_ no id da conta (aceita tanto "act_123" quanto "123")
function normalizarConta(adAccountId: string): string {
  const limpo = String(adAccountId).trim();
  return limpo.startsWith('act_') ? limpo : `act_${limpo}`;
}

// Chama a Graph API e devolve o JSON. IMPORTANTE: nunca incluir a URL em
// logs/erros — ela carrega o access_token na query string.
async function chamarGraph(url: string): Promise<any> {
  const resp = await fetch(url);
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.error) {
    // Erros do Meta vêm em json.error.message (texto legível, sem tokens)
    throw new Error(json?.error?.message || `Meta Graph respondeu HTTP ${resp.status}`);
  }
  return json;
}

// Soma o valor das actions cujo action_type conta como lead
function contarLeads(actions: any): number {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const acao of actions) {
    if (TIPOS_ACAO_LEAD.includes(String(acao?.action_type))) {
      total += Number(acao?.value ?? 0);
    }
  }
  return Math.round(total);
}

// Busca o status de todas as campanhas da conta (Active/Paused), com paginação
async function buscarStatusCampanhas(credenciais: CredenciaisMeta): Promise<Map<string, 'Active' | 'Paused'>> {
  const conta = normalizarConta(credenciais.adAccountId);
  const statusPorCampanha = new Map<string, 'Active' | 'Paused'>();

  const params = new URLSearchParams({
    fields: 'id,name,status',
    limit: '200',
    access_token: credenciais.accessToken,
  });

  let url: string | null = `${GRAPH_BASE}/${conta}/campaigns?${params.toString()}`;
  while (url) {
    const json: any = await chamarGraph(url);
    for (const c of json.data || []) {
      statusPorCampanha.set(String(c?.id ?? ''), c?.status === 'ACTIVE' ? 'Active' : 'Paused');
    }
    // paging.next já vem como URL completa (inclusive com o token) — só seguir
    url = json?.paging?.next || null;
  }

  return statusPorCampanha;
}

// Busca métricas POR CAMPANHA e POR DIA (time_increment=1) dos últimos N dias
export async function buscarMetricasDiarias(credenciais: CredenciaisMeta, dias = 90): Promise<MetricaCampanhaDia[]> {
  const erroValidacao = validarCredenciais(credenciais);
  if (erroValidacao) throw new Error(erroValidacao);

  const conta = normalizarConta(credenciais.adAccountId);
  const { desde, ate } = periodoDias(dias);

  // 1) Status atual das campanhas (o insights não traz status)
  const statusPorCampanha = await buscarStatusCampanhas(credenciais);

  // 2) Insights diários por campanha
  const params = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_increment: '1', // 1 = uma linha por dia
    time_range: JSON.stringify({ since: desde, until: ate }),
    limit: '500',
    access_token: credenciais.accessToken,
  });

  const metricas: MetricaCampanhaDia[] = [];
  let url: string | null = `${GRAPH_BASE}/${conta}/insights?${params.toString()}`;

  while (url) {
    const json: any = await chamarGraph(url);
    for (const linha of json.data || []) {
      const campanhaId = String(linha?.campaign_id ?? '');
      const data = String(linha?.date_start ?? ''); // com time_increment=1, date_start = o dia
      if (!campanhaId || !data) continue; // linha inesperada, ignora

      metricas.push({
        campanhaExternalId: campanhaId,
        campanhaNome: String(linha?.campaign_name ?? ''),
        // Campanha que não aparece mais na lista (apagada/arquivada) tratamos como Paused
        status: statusPorCampanha.get(campanhaId) || 'Paused',
        data,
        spend: Number(linha?.spend ?? 0),
        leads: contarLeads(linha?.actions),
        impressoes: Number(linha?.impressions ?? 0),
        cliques: Number(linha?.clicks ?? 0),
      });
    }
    url = json?.paging?.next || null;
  }

  return metricas;
}

// Testa a conexão: busca nome e status da conta de anúncios
export async function testarConexao(credenciais: CredenciaisMeta): Promise<ResultadoTeste> {
  try {
    const erroValidacao = validarCredenciais(credenciais);
    if (erroValidacao) return { ok: false, detalhe: erroValidacao };

    const conta = normalizarConta(credenciais.adAccountId);
    const params = new URLSearchParams({
      fields: 'name,account_status',
      access_token: credenciais.accessToken,
    });

    const json = await chamarGraph(`${GRAPH_BASE}/${conta}?${params.toString()}`);
    // account_status: 1 = ativa, 2 = desativada, 3 = pendência de pagamento...
    const statusConta = Number(json?.account_status) === 1 ? 'ativa' : `status ${json?.account_status}`;
    return { ok: true, detalhe: `Conta "${json?.name || conta}" conectada (${statusConta})` };
  } catch (e: any) {
    return { ok: false, detalhe: String(e?.message || 'Erro desconhecido ao testar conexão Meta') };
  }
}
