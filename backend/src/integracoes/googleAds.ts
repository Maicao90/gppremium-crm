import { MetricaCampanhaDia, ResultadoTeste, SaldoConta, periodoDias } from './tipos';

// ════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO GOOGLE ADS (REST)
// ════════════════════════════════════════════════════════════════════════
// A Google DESATIVA versões antigas da API aproximadamente 1x por ano.
// Se as chamadas começarem a falhar com erro de "version deprecated/sunset",
// basta atualizar a constante abaixo para a versão vigente (ex.: 'v22').
// Versões disponíveis: https://developers.google.com/google-ads/api/docs/release-notes
export const GOOGLE_ADS_API_VERSION = 'v21';

// Credenciais esperadas para a plataforma 'google'
// customerId = ID da conta Google Ads SÓ DÍGITOS (sem hífens); loginCustomerId = MCC (opcional)
export interface CredenciaisGoogle {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

// Valida a presença dos campos obrigatórios (nunca loga os valores, só os NOMES dos campos)
function validarCredenciais(c: any): string | null {
  const obrigatorios = ['developerToken', 'clientId', 'clientSecret', 'refreshToken', 'customerId'];
  const faltando = obrigatorios.filter((k) => !c || typeof c[k] !== 'string' || !c[k].trim());
  if (faltando.length > 0) return `Credenciais Google incompletas: falta ${faltando.join(', ')}`;
  return null;
}

// Troca o refresh token (permanente) por um access token (curta duração, ~1h).
// É feito a cada sincronização — o access token nunca é persistido nem logado.
export async function trocarRefreshPorAccessToken(credenciais: CredenciaisGoogle): Promise<string> {
  const corpo = new URLSearchParams({
    client_id: credenciais.clientId,
    client_secret: credenciais.clientSecret,
    refresh_token: credenciais.refreshToken,
    grant_type: 'refresh_token',
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });

  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) {
    // O Google devolve o motivo em error/error_description (texto sem segredos)
    throw new Error(`Falha ao renovar token Google: ${json.error_description || json.error || `HTTP ${resp.status}`}`);
  }
  return String(json.access_token);
}

// Monta os headers exigidos pela API do Google Ads
function montarHeaders(credenciais: CredenciaisGoogle, accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': credenciais.developerToken,
  };
  // Quando o acesso é via MCC (conta gerenciadora), o header login-customer-id é obrigatório
  if (credenciais.loginCustomerId && String(credenciais.loginCustomerId).trim()) {
    headers['login-customer-id'] = String(credenciais.loginCustomerId).replace(/\D/g, '');
  }
  return headers;
}

// Executa uma query GAQL via googleAds:search, tratando a paginação (nextPageToken)
async function executarBusca(credenciais: CredenciaisGoogle, accessToken: string, query: string): Promise<any[]> {
  const customerId = credenciais.customerId.replace(/\D/g, ''); // garante só dígitos
  const url = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

  const resultados: any[] = [];
  let pageToken: string | undefined;

  do {
    const corpo: Record<string, string> = { query };
    if (pageToken) corpo.pageToken = pageToken;

    const resp = await fetch(url, {
      method: 'POST',
      headers: montarHeaders(credenciais, accessToken),
      body: JSON.stringify(corpo),
    });

    const json: any = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Erros da Google vêm em json.error.message (texto legível, sem tokens)
      throw new Error(json?.error?.message || `Google Ads respondeu HTTP ${resp.status}`);
    }

    if (Array.isArray(json.results)) resultados.push(...json.results);
    pageToken = json.nextPageToken || undefined;
  } while (pageToken);

  return resultados;
}

// Busca métricas POR CAMPANHA e POR DIA dos últimos N dias
export async function buscarMetricasDiarias(credenciais: CredenciaisGoogle, dias = 90): Promise<MetricaCampanhaDia[]> {
  const erroValidacao = validarCredenciais(credenciais);
  if (erroValidacao) throw new Error(erroValidacao);

  const accessToken = await trocarRefreshPorAccessToken(credenciais);
  const { desde, ate } = periodoDias(dias);

  const query =
    `SELECT campaign.id, campaign.name, campaign.status, segments.date, ` +
    `metrics.cost_micros, metrics.conversions, metrics.impressions, metrics.clicks ` +
    `FROM campaign WHERE segments.date BETWEEN '${desde}' AND '${ate}'`;

  const linhas = await executarBusca(credenciais, accessToken, query);

  const metricas: MetricaCampanhaDia[] = [];
  for (const linha of linhas) {
    const campanhaId = String(linha?.campaign?.id ?? '');
    const data = String(linha?.segments?.date ?? '');
    if (!campanhaId || !data) continue; // linha inesperada, ignora

    metricas.push({
      campanhaExternalId: campanhaId,
      campanhaNome: String(linha?.campaign?.name ?? ''),
      // ENABLED = rodando; qualquer outro (PAUSED, REMOVED...) tratamos como Paused
      status: linha?.campaign?.status === 'ENABLED' ? 'Active' : 'Paused',
      data,
      // cost_micros vem em micros (milionésimos da moeda da conta)
      spend: Number(linha?.metrics?.costMicros ?? 0) / 1_000_000,
      // conversions vem como fração (ex.: 1.5) — arredondamos para inteiro
      leads: Math.round(Number(linha?.metrics?.conversions ?? 0)),
      impressoes: Number(linha?.metrics?.impressions ?? 0),
      cliques: Number(linha?.metrics?.clicks ?? 0),
    });
  }

  return metricas;
}

// Busca saldo e gasto do dia da CONTA (alimenta a tela "Saldos das Contas").
// - gastoDia: soma do cost_micros de hoje (nível customer).
// - saldo: só existe em conta PRÉ-PAGA/faturada (account_budget aprovado).
//   Conta pós-paga no cartão (sem account_budget ou limite infinito) → saldo = null,
//   e a UI preserva o valor digitado manualmente.
export async function buscarSaldoConta(credenciais: CredenciaisGoogle): Promise<SaldoConta> {
  const erroValidacao = validarCredenciais(credenciais);
  if (erroValidacao) throw new Error(erroValidacao);

  const accessToken = await trocarRefreshPorAccessToken(credenciais);

  // 1) Gasto de HOJE no nível da conta (customer) + moeda da conta
  const linhasGasto = await executarBusca(
    credenciais,
    accessToken,
    `SELECT metrics.cost_micros, customer.currency_code FROM customer WHERE segments.date DURING TODAY`,
  );

  let gastoDia = 0;
  let moeda: string | undefined;
  for (const linha of linhasGasto) {
    gastoDia += Number(linha?.metrics?.costMicros ?? 0) / 1_000_000; // micros → moeda
    if (linha?.customer?.currencyCode) moeda = String(linha.customer.currencyCode);
  }

  // 2) Saldo via account_budget (orçamento de conta aprovado — só pré-pago/faturado)
  const linhasBudget = await executarBusca(
    credenciais,
    accessToken,
    `SELECT account_budget.status, account_budget.adjusted_spending_limit_micros, ` +
      `account_budget.amount_served_micros FROM account_budget ` +
      `WHERE account_budget.status = 'APPROVED'`,
  );

  let saldo: number | null = null;
  let algumIlimitado = false;
  let somaSaldo = 0;
  let temBudget = false;

  for (const linha of linhasBudget) {
    const budget = linha?.accountBudget;
    if (!budget) continue;
    temBudget = true;
    // Limite ausente ou -1 = orçamento ILIMITADO (pós-pago) → não dá para calcular saldo
    const limiteMicros = Number(budget?.adjustedSpendingLimitMicros ?? -1);
    if (!Number.isFinite(limiteMicros) || limiteMicros < 0) {
      algumIlimitado = true;
      continue;
    }
    const servidoMicros = Number(budget?.amountServedMicros ?? 0);
    somaSaldo += (limiteMicros - servidoMicros) / 1_000_000;
  }

  // Sem account_budget ou com limite infinito → conta no cartão pós-pago → saldo = null
  if (temBudget && !algumIlimitado) saldo = Math.round(somaSaldo * 100) / 100;

  return { saldo, gastoDia: Math.round(gastoDia * 100) / 100, moeda };
}

// Testa a conexão: valida o refresh token e faz uma query mínima na conta
export async function testarConexao(credenciais: CredenciaisGoogle): Promise<ResultadoTeste> {
  try {
    const erroValidacao = validarCredenciais(credenciais);
    if (erroValidacao) return { ok: false, detalhe: erroValidacao };

    const accessToken = await trocarRefreshPorAccessToken(credenciais);
    await executarBusca(credenciais, accessToken, 'SELECT customer.id FROM customer LIMIT 1');

    return { ok: true, detalhe: `Conexão Google Ads OK (conta ${credenciais.customerId.replace(/\D/g, '')})` };
  } catch (e: any) {
    return { ok: false, detalhe: String(e?.message || 'Erro desconhecido ao testar conexão Google') };
  }
}
