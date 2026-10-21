import 'dotenv/config';
import { resolverDiaVisita, horariosLembreteVisita } from './data/visita';
import { extrairIntencoesPreco } from './data/fluxoPrecoExtrator';

// datas: "agora" = terca 21/10/2026 15h BRT (18h UTC)
const agora = new Date('2026-10-21T18:00:00Z');
for (const t of ['hoje', 'amanha', 'depois_de_amanha', 'sabado', 'terca', 'segunda', '25', '25/10', '05', '5/11', 'semana que vem', null]) {
  const v = resolverDiaVisita(t as any, agora);
  const h = v ? horariosLembreteVisita(v) : null;
  console.log(String(t).padEnd(18), '->', v ? `${v.iso} "${v.rotulo}" (${v.diasAte}d) vespera=${h!.vespera?.toISOString().slice(0, 16) || '-'} dia=${h!.noDia?.toISOString().slice(0, 16) || '-'}` : 'null');
}

(async () => {
  const k = process.env.ANTHROPIC_API_KEY as string;
  for (const m of ['vou passar aí no sábado pra trocar', 'amanhã cedo eu vou aí', 'dia 25 eu passo aí pra montar', 'semana que vem eu passo aí', 'vcs abrem sábado?', 'combinado, amanhã 10h eu passo aí', 'ok obrigado']) {
    const it = await extrairIntencoesPreco([m], 'ROBO: o pneu sai por R$289,00 à vista', k);
    console.log(m, '->', JSON.stringify(it?.map((i: any) => [i.intencao, i.diaVisita])));
  }
})();
