import { LojaCentral } from './config';
import { CampanhaLinha, DepositoLinha, Plataforma, ResultadoLoja, ResultadoPlataforma, SaldoConta } from './dados';

// Textos da Central de Trafego no formato nativo do WhatsApp (*negrito*, emojis moderados, separadores).
// Regra: so dados — nada de nome de campanha no relatorio diario e nenhuma analise/opiniao.
// 10/11 (dono): sem "conversoes" (o numero das plataformas nao fazia sentido ao lado das conversas reais), sem
// valor de recarga sugerida e sem a secao de recargas no diario (o historico de deposito nao vem das plataformas).

export const LINHA = '━━━━━━━━━━━━━━━━━━━━';
const RODAPE = `${LINHA}\n🤖 Central de Tráfego • GP Premium`;
const NAO_DISP = 'Não disponível';

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (n: number) => fmtBRL.format(n).replace(/ /g, ' ');
const nomePlat = (p: Plataforma) => (p === 'meta' ? 'Meta Ads' : 'Google Ads');
const iconePlat = (p: Plataforma) => (p === 'meta' ? '🔵' : '🟢');
const num2 = (i: number) => String(i + 1).padStart(2, '0');

export function dataBR(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}
const rotuloPeriodo = (ini: string, fim: string) => (ini === fim ? dataBR(ini) : `${dataBR(ini)} a ${dataBR(fim)}`);

const gastoPlataforma = (rs: ResultadoLoja[], pl: Plataforma) => rs.filter((r) => r[pl].conectada).reduce((s, r) => s + r[pl].gasto, 0);

function linhaPlataformaDaLoja(r: ResultadoPlataforma, pl: Plataforma): string {
  if (!r.conectada) return `${iconePlat(pl)} ${nomePlat(pl)}: ${NAO_DISP} (conta não conectada)`;
  const aviso = r.disponivel ? '' : ' ⚠️ (última atualização com erro)';
  return `${iconePlat(pl)} ${nomePlat(pl)}: ${brl(r.gasto)}${aviso}`;
}

const valorSaldo = (s?: SaldoConta) => (!s ? NAO_DISP : s.saldo === null ? NAO_DISP : brl(Math.max(0, s.saldo)));

export function blocoLoja(i: number, r: ResultadoLoja, saldos?: SaldoConta[]): string {
  const partes = [
    `${LINHA}\n🏪 *${num2(i)} | ${r.loja.nome.toUpperCase()}*\n${LINHA}`,
    `💰 *GASTO TOTAL: ${brl(r.meta.gasto + r.google.gasto)}*\n💬 Conversas recebidas: ${r.conversas === null ? NAO_DISP : r.conversas}`,
    `${linhaPlataformaDaLoja(r.meta, 'meta')}\n${linhaPlataformaDaLoja(r.google, 'google')}`,
  ];
  if (saldos) {
    const sm = saldos.find((s) => s.loja.id === r.loja.id && s.plataforma === 'meta');
    const sg = saldos.find((s) => s.loja.id === r.loja.id && s.plataforma === 'google');
    partes.push(`💳 *Saldos*\n🔵 Meta: ${valorSaldo(sm)}\n🟢 Google: ${valorSaldo(sg)}`);
  }
  return partes.join('\n\n');
}

function resumoGeral(rs: ResultadoLoja[]): string {
  const meta = gastoPlataforma(rs, 'meta');
  const google = gastoPlataforma(rs, 'google');
  const conversas = rs.every((r) => r.conversas === null) ? null : rs.reduce((s, r) => s + (r.conversas || 0), 0);
  return `📌 *RESUMO GERAL*\n${LINHA}\n💰 Investimento total: *${brl(meta + google)}*\n💬 Conversas recebidas: ${conversas === null ? NAO_DISP : conversas}\n\n🔵 Meta Ads: *${brl(meta)}*\n🟢 Google Ads: *${brl(google)}*`;
}

const NIVEL_TXT: Record<string, string> = { normal: '🟢 Normal', atencao: '🟠 Atenção', critico: '🔴 Crítico', desconhecido: '⚪ Não verificável' };

export function blocoAlertas(saldos: SaldoConta[]): string | null {
  const ruins = saldos.filter((s) => s.nivel === 'atencao' || s.nivel === 'critico');
  if (!ruins.length) return null;
  const lojas = [...new Map(ruins.map((s) => [s.loja.id, s.loja])).values()];
  const blocos = lojas.map((l) => {
    const linhas = ruins.filter((s) => s.loja.id === l.id).map((s) => `${iconePlat(s.plataforma)} ${nomePlat(s.plataforma).split(' ')[0]}: ${valorSaldo(s)} — ${NIVEL_TXT[s.nivel]}`);
    return `⚠️ *${l.nome}*\n${linhas.join('\n')}`;
  });
  return `${LINHA}\n🚨 *ALERTAS DE SALDO*\n${LINHA}\n\n${blocos.join('\n\n')}`;
}

export function menuPrincipal(): string {
  return `${LINHA}\n🤖 *CENTRAL DE COMANDOS*\n${LINHA}\n1 📊 HOJE — Relatório atualizado\n2 🚀 CAMPANHAS — Consultar campanhas\n3 🏪 LOJAS — Selecionar loja\n4 🔵 META — Resultados Meta Ads\n5 🟢 GOOGLE — Resultados Google Ads\n6 💳 SALDOS — Consultar saldos\n7 💵 RECARGAS — Depósitos do mês\n8 📈 SEMANA — Relatório semanal\n\n↩️ Digite MENU para voltar.`;
}

// Relatorio completo (diario das 8h, HOJE e SEMANA). Volta uma lista de blocos; quem envia junta/divide.
export function relatorioGeral(opts: {
  titulo: string;
  ini: string;
  fim: string;
  resultados: ResultadoLoja[];
  saldos?: SaldoConta[];
  atualizadoEm?: string; // 'HH:MM' — so no HOJE
  comMenu?: boolean;
}): string[] {
  const n = opts.resultados.length;
  const blocos = [
    `📊 *CENTRAL DE TRÁFEGO PAGO*\n${LINHA}\n📅 ${rotuloPeriodo(opts.ini, opts.fim)}\n🏪 *${opts.titulo}${n > 1 ? ` — ${n} LOJAS` : ''}*${opts.atualizadoEm ? `\n🕒 Atualizado às ${opts.atualizadoEm}` : ''}`,
    resumoGeral(opts.resultados),
    ...opts.resultados.map((r, i) => blocoLoja(i, r, opts.saldos)),
  ];
  if (opts.saldos) { const a = blocoAlertas(opts.saldos); if (a) blocos.push(a); }
  if (opts.comMenu) blocos.push(menuPrincipal());
  blocos.push(`${RODAPE}\nRelatório gerado automaticamente`);
  return blocos;
}

// So uma plataforma (comandos META / GOOGLE).
export function relatorioPlataforma(pl: Plataforma, ini: string, fim: string, rs: ResultadoLoja[], saldos: SaldoConta[], atualizadoEm?: string): string[] {
  const cab = `${iconePlat(pl)} *${nomePlat(pl).toUpperCase()}*\n${LINHA}\n📅 ${rotuloPeriodo(ini, fim)}${atualizadoEm ? ` • atualizado às ${atualizadoEm}` : ''}\n\n💰 Investimento: *${brl(gastoPlataforma(rs, pl))}*`;
  const lojas = rs.map((r, i) => {
    const s = saldos.find((x) => x.loja.id === r.loja.id && x.plataforma === pl);
    const gasto = r[pl].conectada ? brl(r[pl].gasto) + (r[pl].disponivel ? '' : ' ⚠️ (última atualização com erro)') : `${NAO_DISP} (conta não conectada)`;
    return `${LINHA}\n🏪 *${num2(i)} | ${r.loja.nome.toUpperCase()}*\n• Gasto: ${gasto}\n• Saldo: ${valorSaldo(s)}`;
  });
  return [cab, ...lojas, `${RODAPE}\nDigite MENU para voltar.`];
}

export function relatorioSaldos(saldos: SaldoConta[], lojas: LojaCentral[]): string[] {
  const blocos = [`💳 *SALDOS DAS CONTAS*\n${LINHA}\n⏳ Autonomia = estimativa pelo gasto médio dos últimos 7 dias.`];
  lojas.forEach((l, i) => {
    const daLoja = saldos.filter((s) => s.loja.id === l.id);
    if (!daLoja.length) return;
    const linhas = daLoja.map((s) => {
      const auto = s.autonomiaDias === null ? '—' : `${String(s.autonomiaDias).replace('.', ',')} dia(s)`;
      const media = s.mediaDiaria === null ? '—' : `${brl(s.mediaDiaria)}/dia`;
      return `${iconePlat(s.plataforma)} *${nomePlat(s.plataforma)}*: ${valorSaldo(s)}\n  ${NIVEL_TXT[s.nivel]} • consumo ${media} • autonomia ${auto}`;
    });
    blocos.push(`${LINHA}\n🏪 *${num2(i)} | ${l.nome.toUpperCase()}*\n${linhas.join('\n')}`);
  });
  blocos.push(`${RODAPE}\nDigite MENU para voltar.`);
  return blocos;
}

export function relatorioRecargas(deps: DepositoLinha[], lojas: LojaCentral[], ini: string, fim: string, filtro: string): string[] {
  const total = deps.reduce((s, d) => s + d.valor, 0);
  const cab = `💵 *RECARGAS — ${filtro.toUpperCase()}*\n${LINHA}\n📅 ${dataBR(ini)} a ${dataBR(fim)}\n💰 Total registrado: *${brl(total)}*\n\n_A Meta e o Google não informam o histórico de depósitos. Aqui aparecem só os detectados pelo aumento do saldo (desde 10/11) e os lançados com DEPOSITO._`;
  if (!deps.length) return [cab, `Nenhum depósito registrado nesse período.\n\nPara lançar: *DEPOSITO <loja> <META ou GOOGLE> <valor>*\nEx.: DEPOSITO GP META 500\n\n${RODAPE}`];
  const blocos = [cab];
  for (const l of lojas) {
    const daLoja = deps.filter((d) => d.loja.id === l.id);
    if (!daLoja.length) continue;
    const linhas = daLoja.map((d) => `${iconePlat(d.plataforma)} ${dataBR(d.data)} • ${brl(d.valor)} • ${nomePlat(d.plataforma)} • _${d.origem}_`);
    blocos.push(`🏪 *${l.nome}* — ${brl(daLoja.reduce((s, d) => s + d.valor, 0))}\n${linhas.join('\n')}`);
  }
  blocos.push(`${RODAPE}\nDigite MENU para voltar.`);
  return blocos;
}

export function relatorioCampanhas(titulo: string, ini: string, camps: CampanhaLinha[], plataformas: Plataforma[], saldos: SaldoConta[], lojas: LojaCentral[]): string[] {
  const gasto = camps.reduce((s, c) => s + c.gasto, 0);
  const blocos = [
    `📊 *CENTRAL DE TRÁFEGO PAGO*\n${LINHA}\n🏪 *${titulo.toUpperCase()}*\n📅 ${dataBR(ini)} (hoje)\n📡 ${plataformas.map(nomePlat).join(' + ')}`,
    `📌 *VISÃO GERAL*\n${LINHA}\n💰 ${brl(gasto)} investidos\n🚀 ${camps.length} campanhas ativas`,
  ];
  let n = 0;
  for (const l of lojas) {
    for (const pl of plataformas) {
      const lista = camps.filter((c) => c.loja.id === l.id && c.plataforma === pl);
      if (!lista.length) continue;
      const cards = lista.map((c) => {
        n++;
        return `┌ 📢 *CAMPANHA ${String(n).padStart(2, '0')}*\n│ ${c.nome}\n│ 🟢 Status: Ativa\n│ 💰 Gasto: ${brl(c.gasto)}\n└────────────────`;
      });
      blocos.push(`${LINHA}\n${iconePlat(pl)} *${l.nome.toUpperCase()} — ${nomePlat(pl).toUpperCase()}*\n${LINHA}\n💰 Investimento: ${brl(lista.reduce((s, c) => s + c.gasto, 0))}\n\n${cards.join('\n')}`);
    }
  }
  if (!camps.length) blocos.push('Nenhuma campanha ativa encontrada nesse filtro.');
  const saldoLinhas = lojas.flatMap((l) => plataformas.map((pl) => {
    const s = saldos.find((x) => x.loja.id === l.id && x.plataforma === pl);
    return s ? `${iconePlat(pl)} ${l.nome} — ${nomePlat(pl)}: ${valorSaldo(s)}` : null;
  })).filter(Boolean);
  if (saldoLinhas.length) blocos.push(`${LINHA}\n💳 *CONTROLE FINANCEIRO*\n${LINHA}\n${saldoLinhas.join('\n')}`);
  blocos.push(`${LINHA}\n🤖 *COMANDOS*\nDigite o *número da campanha* para ver os detalhes\nCAMPANHAS — Escolher outro filtro\nSALDOS — Consultar saldos\nHOJE — Relatório geral\nVOLTAR — Menu anterior`);
  return blocos;
}

export function detalheCampanha(n: number, c: CampanhaLinha): string {
  const ctr = c.impressoes > 0 ? `${((c.cliques / c.impressoes) * 100).toFixed(2).replace('.', ',')}%` : '—';
  const cpm = c.impressoes > 0 ? brl((c.gasto / c.impressoes) * 1000) : '—';
  const cpc = c.cliques > 0 ? brl(c.gasto / c.cliques) : '—';
  const orc = c.orcamentoDiario ? brl(c.orcamentoDiario) + '/dia' : NAO_DISP;
  return `📢 *CAMPANHA ${String(n).padStart(2, '0')}*\n${LINHA}\n${c.nome}\n🏪 ${c.loja.nome} • ${iconePlat(c.plataforma)} ${nomePlat(c.plataforma)}\n📅 Hoje\n\n💰 Gasto: ${brl(c.gasto)}\n👁️ Impressões: ${c.impressoes.toLocaleString('pt-BR')}\n👆 Cliques: ${c.cliques.toLocaleString('pt-BR')}\n📈 CTR: ${ctr}\n💵 CPM: ${cpm}\n🖱️ CPC: ${cpc}\n🗓️ Orçamento: ${orc}\n\n_Métricas da ${nomePlat(c.plataforma)} — cada plataforma tem a sua definição._\n\nVOLTAR — lista de campanhas`;
}

export function alertaSaldo(s: SaldoConta): string {
  const auto = s.autonomiaDias === null ? '—' : `${String(s.autonomiaDias).replace('.', ',')} dia(s) (estimativa)`;
  const nivel = s.nivel === 'critico' ? '🔴 *SALDO CRÍTICO*' : '🟠 *SALDO EM ATENÇÃO*';
  const conta = s.plataforma === 'google' && s.contaExterna ? `\n🧾 Conta Google: ${s.contaExterna}` : '';
  return `🚨 *ALERTA DE SALDO BAIXO*\n${LINHA}\n\n🏪 *${s.loja.nome.toUpperCase()}*\n📡 Plataforma: ${nomePlat(s.plataforma)}\n\n💰 Saldo atual: *${valorSaldo(s)}*\n💸 Consumo médio: ${s.mediaDiaria === null ? '—' : brl(s.mediaDiaria) + '/dia'}\n⏳ Autonomia: ${auto}\n\n${nivel}\n\n🔗 Pagamento oficial: ${s.linkPagamento}${conta}\n\n⚠️ A conta pode ficar sem saldo para continuar veiculando anúncios.`;
}

export const menuLojas = (lojas: LojaCentral[], titulo = '🏪 *SELECIONE A LOJA*') =>
  `${titulo}\n${LINHA}\n${lojas.map((l, i) => `${i + 1} — ${l.nome}`).join('\n')}\n\nResponda com o número da opção.\n↩️ VOLTAR — Menu anterior`;

export const menuCampanhas = () =>
  `🚀 *CONSULTA DE CAMPANHAS*\n${LINHA}\nComo deseja consultar?\n\n1 — Todas as lojas (Meta + Google)\n2 — Todas as lojas (somente Meta)\n3 — Todas as lojas (somente Google)\n4 — Selecionar uma loja\n\nResponda com o número da opção.\n↩️ VOLTAR — Menu principal`;

export const menuPlataforma = () => `📡 *SELECIONE A PLATAFORMA*\n${LINHA}\n1 — Meta Ads\n2 — Google Ads\n3 — Ambas\n\n↩️ VOLTAR — Menu anterior`;

export const menuMetaGoogle = (pl: Plataforma, lojas: LojaCentral[]) =>
  `${iconePlat(pl)} *${nomePlat(pl).toUpperCase()}*\n${LINHA}\n1 — Todas as lojas\n${lojas.map((l, i) => `${i + 2} — ${l.nome}`).join('\n')}\n\nResponda com o número da opção.\n↩️ VOLTAR — Menu principal`;

export const menuRecargas = () =>
  `💵 *RECARGAS DO MÊS*\n${LINHA}\n1 — Todas as lojas\n2 — Uma loja específica\n3 — Apenas Meta\n4 — Apenas Google\n\nResponda com o número da opção.\n↩️ VOLTAR — Menu principal`;

// Junta blocos em mensagens de ate `max` caracteres, sempre quebrando entre blocos (nunca no meio de uma loja).
export function juntarEmMensagens(blocos: string[], max = 3500): string[] {
  const saida: string[] = [];
  let atual = '';
  for (const b of blocos) {
    if (atual && atual.length + b.length + 2 > max) { saida.push(atual); atual = ''; }
    atual = atual ? `${atual}\n\n${b}` : b;
  }
  if (atual) saida.push(atual);
  return saida;
}
