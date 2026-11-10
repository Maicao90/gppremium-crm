import { MetricaCampanhaDia, ResultadoTeste, SaldoConta, periodoDias } from './tipos';

// ════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO META ADS (Graph API — Facebook/Instagram)
// ════════════════════════════════════════════════════════════════════════
// O Meta DESATIVA versões antigas da Graph API ~2 anos após o lançamento.
// Se as chamadas começarem a falhar com erro de versão descontinuada,
// basta atualizar a constante abaixo para a versão vigente (ex.: 'v24.0').
// Changelog: https://developers.facebook.com/docs/graph-api/changelog
export const META_GRAPH_VERSION = 'v25.0';

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Credenciais esperadas para a plataforma 'meta'
// adAccountId no formato act_123456789
// appSecret é OPCIONAL: se presente, todas as chamadas assinam com appsecret_proof
// (camada extra de segurança que o app pode exigir). Sem ele, funciona se o app não
// tiver "Require app secret" ligado.
export interface CredenciaisMeta {
  accessToken: string;
  adAccountId: string;
  appSecret?: string;
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

// appsecret_proof = HMAC-SHA256 do access_token usando o App Secret como chave.
// Só é gerado se a conexão tiver appSecret. Adiciona uma camada de segurança contra
// uso do token roubado sem o segredo do app.
function appsecretProof(accessToken: string, appSecret?: string): string | null {
  if (!appSecret || !appSecret.trim()) return null;
  const crypto = require('crypto');
  return crypto.createHmac('sha256', appSecret.trim()).update(accessToken).digest('hex');
}

// Executa uma ESCRITA (POST) na Graph API. O token e os parâmetros vão no BODY
// (form-urlencoded), nunca na URL — então a URL pode aparecer em log sem vazar segredo.
// Usada só pelo Otimizador do Meta, sempre após aprovação humana individual no painel.
export async function chamarGraphPost(
  credenciais: CredenciaisMeta,
  path: string,
  campos: Record<string, string | number>,
): Promise<any> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) body.set(k, String(v));
  body.set('access_token', credenciais.accessToken);
  const proof = appsecretProof(credenciais.accessToken, credenciais.appSecret);
  if (proof) body.set('appsecret_proof', proof);

  const resp = await fetch(`${GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || json?.error) {
    throw new Error(traduzirErroMeta(json?.error?.message || `Meta Graph respondeu HTTP ${resp.status}`));
  }
  return json;
}

// Traduz erros comuns da Graph API para português leigo.
export function traduzirErroMeta(msg: string): string {
  const m = String(msg).toLowerCase();
  if (m.includes('token') && (m.includes('expired') || m.includes('invalid') || m.includes('session'))) {
    return 'A conexão com o Facebook expirou ou foi revogada. Gere um novo token (Usuário do Sistema) e atualize a conexão.';
  }
  if (m.includes('permission') || m.includes('(#200)') || m.includes('do not have')) {
    return 'Sem permissão para alterar esta conta. Confirme que o token tem "ads_management" e que a conta está atribuída ao Usuário do Sistema.';
  }
  if (m.includes('budget') && (m.includes('minimum') || m.includes('too low') || m.includes('less than'))) {
    return 'Orçamento abaixo do mínimo permitido pelo Facebook para esta campanha.';
  }
  if (m.includes('rate') || m.includes('(#17)') || m.includes('(#613)') || m.includes('too many')) {
    return 'Muitas alterações em pouco tempo (limite do Facebook). Espere alguns minutos e tente de novo.';
  }
  return msg;
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

// "Saldo disponível (R$1.234,56 BRL)" -> 1234.56. Null quando a conta nao e pre-paga ou o texto nao traz o valor.
function saldoPrePagoMeta(conta: any): number | null {
  const fonte = conta?.funding_source_details;
  if (!conta?.is_prepay_account && Number(fonte?.type) !== 20) return null;
  const m = /R\$\s*([\d.,]+)/.exec(String(fonte?.display_string || ''));
  if (!m) return null;
  const bruto = m[1] as string;
  const normal = bruto.lastIndexOf(',') > bruto.lastIndexOf('.') ? bruto.replace(/\./g, '').replace(',', '.') : bruto.replace(/,/g, '');
  const valor = Number(normal);
  return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
}

// Busca saldo e gasto do dia da CONTA (alimenta a tela "Saldos das Contas").
// - saldo: spend_cap e amount_spent vêm em CENTAVOS; só há saldo calculável quando
//   a conta tem limite de gastos (spend_cap > 0). Conta sem limite (pós-paga no
//   cartão) → saldo = null, e a UI preserva o valor digitado manualmente.
// - gastoDia: insights com date_preset=today (spend já vem em unidade monetária).
export async function buscarSaldoConta(credenciais: CredenciaisMeta): Promise<SaldoConta> {
  const erroValidacao = validarCredenciais(credenciais);
  if (erroValidacao) throw new Error(erroValidacao);

  const conta = normalizarConta(credenciais.adAccountId);

  // 1) Dados da conta: spend_cap / amount_spent (centavos) + moeda
  const paramsConta = new URLSearchParams({
    fields: 'name,currency,amount_spent,spend_cap,is_prepay_account,funding_source_details',
    access_token: credenciais.accessToken,
  });
  const jsonConta = await chamarGraph(`${GRAPH_BASE}/${conta}?${paramsConta.toString()}`);

  const spendCap = Number(jsonConta?.spend_cap ?? 0);
  const amountSpent = Number(jsonConta?.amount_spent ?? 0);
  // spend_cap = 0 (ou ausente) significa "sem limite de gastos" → saldo desconhecido
  // 10/11: conta PRE-PAGA (todas as do grupo GP): o saldo de verdade e o "Saldo disponivel (R$X BRL)" da forma de
  // pagamento — spend_cap - amount_spent e o limite de gastos, nao o saldo (dava -0,01 em conta zerada e R$229 na
  // Super Via, que tinha R$261).
  const saldoPrePago = saldoPrePagoMeta(jsonConta);
  const saldo = saldoPrePago !== null ? saldoPrePago : spendCap > 0 ? Math.round(spendCap - amountSpent) / 100 : null;
  const moeda = jsonConta?.currency ? String(jsonConta.currency) : undefined;

  // 2) Gasto de HOJE no nível da conta (insights sem level = conta inteira)
  const paramsGasto = new URLSearchParams({
    date_preset: 'today',
    fields: 'spend',
    access_token: credenciais.accessToken,
  });
  const jsonGasto = await chamarGraph(`${GRAPH_BASE}/${conta}/insights?${paramsGasto.toString()}`);

  let gastoDia = 0;
  for (const linha of jsonGasto?.data || []) {
    gastoDia += Number(linha?.spend ?? 0); // spend já vem em unidade monetária
  }

  return { saldo, gastoDia: Math.round(gastoDia * 100) / 100, moeda };
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
