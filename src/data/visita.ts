// Visita do cliente na loja (21/10): o cliente diz que vem ("vou passar aí sábado", "amanhã cedo eu vou") e o
// robo confirma, anota e lembra (véspera, se faltar 2+ dias, e no dia). Aqui so a conta de DATA — pura, sem banco.
// O dia vem normalizado da leitura do Claude: 'hoje', 'amanha', 'depois_de_amanha', dia da semana ('segunda'..
// 'domingo'), 'DD' ou 'DD/MM'. Tudo no fuso de Brasilia.

const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export interface DiaVisita { iso: string; rotulo: string; diasAte: number }

function hojeBR(agora: Date): { ano: number; mes: number; dia: number; semana: number; hora: number } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value || '';
  const semana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  return { ano: Number(v('year')), mes: Number(v('month')), dia: Number(v('day')), semana, hora: Number(v('hour')) % 24 };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dd = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export function resolverDiaVisita(token: string | null | undefined, agora = new Date()): DiaVisita | null {
  const t = String(token || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_');
  if (!t) return null;
  const h = hojeBR(agora);
  const hoje = new Date(Date.UTC(h.ano, h.mes - 1, h.dia));
  const mais = (n: number) => { const d = new Date(hoje); d.setUTCDate(d.getUTCDate() + n); return d; };
  let alvo: Date | null = null;
  if (t === 'hoje') alvo = hoje;
  else if (t === 'amanha') alvo = mais(1);
  else if (t === 'depois_de_amanha') alvo = mais(2);
  else if (DIAS.includes(t.replace(/_feira$/, ''))) {
    const w = DIAS.indexOf(t.replace(/_feira$/, ''));
    let n = (w - h.semana + 7) % 7;
    if (n === 0 && h.hora >= 12) n = 7; // "vou sabado" dito no sabado a tarde = o proximo
    alvo = mais(n);
  } else {
    const m = /^(\d{1,2})(?:\/(\d{1,2}))?$/.exec(t);
    if (m) {
      const dia = Number(m[1]);
      let mes = m[2] ? Number(m[2]) : h.mes;
      let ano = h.ano;
      if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
      let d = new Date(Date.UTC(ano, mes - 1, dia));
      if (!m[2] && d < hoje) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } d = new Date(Date.UTC(ano, mes - 1, dia)); }
      if (m[2] && d < hoje) d = new Date(Date.UTC(ano + 1, mes - 1, dia));
      alvo = d;
    }
  }
  if (!alvo) return null;
  const diasAte = Math.round((alvo.getTime() - hoje.getTime()) / 86400_000);
  if (diasAte < 0 || diasAte > 45) return null;
  const rotulo = diasAte === 0 ? 'hoje' : diasAte === 1 ? 'amanhã' : `${NOME_DIA[alvo.getUTCDay()] === 'sábado' || NOME_DIA[alvo.getUTCDay()] === 'domingo' ? 'no' : 'na'} ${NOME_DIA[alvo.getUTCDay()]} (${dd(alvo)})`;
  return { iso: iso(alvo), rotulo, diasAte };
}

// Horarios dos lembretes (UTC) pra um dia de visita: vespera 17:00 e no dia 08:30, em Brasilia (UTC-3).
export function horariosLembreteVisita(v: DiaVisita): { vespera: Date | null; noDia: Date | null } {
  const [y, m, d] = v.iso.split('-').map(Number) as [number, number, number];
  const noDia = v.diasAte >= 1 ? new Date(Date.UTC(y, m - 1, d, 11, 30)) : null;           // 08:30 BRT
  const vespera = v.diasAte >= 2 ? new Date(Date.UTC(y, m - 1, d - 1, 20, 0)) : null;       // 17:00 BRT do dia anterior
  return { vespera, noDia };
}
