// 22/10 (dono: "maximo de 20 por dia, espacado"): redistribui os agendamentos da recuperacao, mantendo a ordem
// (mais recentes primeiro). Seg-sex 9h-11h30 e 14h-17h; sabado so 9h-11h45; domingo nada.
const { execSync } = require('child_process');
const POR_DIA = 20;
const sql = (q) => execSync(`docker exec -i gp-postgres-crm psql -U postgres -d testdb -tA -F '\t'`, { input: q, maxBuffer: 1 << 26 }).toString().trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
const ids = sql(`select id from "Agendamento" where observacoes like 'robo-recuperacao 22/10%' and status='pendente' order by "enviarEm";`).map((r) => r[0]);

function* horarios() {
  const d = new Date(Date.now() - 3 * 3600e3);
  d.setUTCDate(d.getUTCDate() + 1);
  for (;;) {
    const dia = d.getUTCDay();
    const feriado = ['11-02', '11-15', '11-20', '12-24', '12-25', '12-31', '01-01'].includes(d.toISOString().slice(5, 10));
    if (dia !== 0 && !feriado) {
      const janelas = dia === 6 ? [[9 * 60, 11 * 60 + 45]] : [[9 * 60, 11 * 60 + 30], [14 * 60, 17 * 60]];
      const slots = [];
      for (const [a, b] of janelas) for (let t = a; t < b; t++) slots.push(t);
      const passo = Math.floor(slots.length / POR_DIA); // ~16 min entre um e outro
      for (let i = 0; i < POR_DIA; i++) {
        const min = slots[i * passo + Math.floor(Math.random() * Math.max(1, passo - 3))];
        yield new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(min / 60) + 3, min % 60, Math.floor(Math.random() * 60)));
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
const h = horarios();
const valores = ids.map((id) => `('${id}', '${h.next().value.toISOString()}'::timestamp)`);
for (let i = 0; i < valores.length; i += 300) {
  sql(`update "Agendamento" a set "enviarEm" = v.t, "atualizadoEm" = now() from (values ${valores.slice(i, i + 300).join(',')}) as v(id, t) where a.id = v.id;`);
}
console.log('redistribuidos:', ids.length);
for (const r of sql(`select to_char("enviarEm" - interval '3 hours','DD/MM (Dy)'), count(*), to_char(min("enviarEm") - interval '3 hours','HH24:MI'), to_char(max("enviarEm") - interval '3 hours','HH24:MI') from "Agendamento" where observacoes like 'robo-recuperacao 22/10%' and status='pendente' group by 1, date_trunc('day',"enviarEm" - interval '3 hours') order by date_trunc('day',"enviarEm" - interval '3 hours');`).slice(0, 4)) console.log(r.join(' | '));
console.log('ultimo dia:', sql(`select to_char(max("enviarEm") - interval '3 hours','DD/MM/YYYY') from "Agendamento" where observacoes like 'robo-recuperacao 22/10%' and status='pendente';`)[0][0]);
console.log('max por dia:', sql(`select max(c) from (select count(*) c from "Agendamento" where observacoes like 'robo-recuperacao 22/10%' and status='pendente' group by date_trunc('day',"enviarEm" - interval '3 hours')) x;`)[0][0]);
