// Tipos e utilitários compartilhados entre as integrações de anúncios (Google Ads / Meta Ads)

// Uma linha de métrica: UMA campanha em UM dia
export interface MetricaCampanhaDia {
  campanhaExternalId: string;
  campanhaNome: string;
  status: 'Active' | 'Paused';
  data: string; // dia no formato YYYY-MM-DD
  spend: number; // gasto em moeda da conta (já convertido de micros no caso do Google)
  leads: number;
  impressoes: number;
  cliques: number;
}

// Resultado padronizado do teste de conexão de qualquer plataforma
export interface ResultadoTeste {
  ok: boolean;
  detalhe: string;
}

// Saldo e gasto do dia de UMA conta de anúncio (alimenta a tela "Saldos das Contas").
// saldo = null significa "a plataforma não informa saldo" (ex.: conta pós-paga no
// cartão) — nesse caso o valor manual digitado pelo usuário é preservado.
export interface SaldoConta {
  saldo: number | null;
  gastoDia: number;
  moeda?: string;
}

// Formata uma data como YYYY-MM-DD (padrão aceito pelo Google e pelo Meta)
export function formatarDataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Calcula o intervalo dos últimos N dias, terminando hoje
export function periodoDias(dias: number): { desde: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - dias * 24 * 60 * 60 * 1000);
  return { desde: formatarDataISO(inicio), ate: formatarDataISO(hoje) };
}
