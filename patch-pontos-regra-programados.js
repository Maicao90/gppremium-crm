// 21/10 (decisao do dono): agendamento da campanha = todo agendamento PROGRAMADO (criado) no periodo,
// ja tenha saido ou nao — enviados nao somam por cima. Um por um (sem "1 por cliente por dia").
// Cancelado e lembrete do robo (observacoes 'robo-') nao contam.
const fs = require('fs');
const base = process.argv[2];
const alvo = process.argv[3];
const rep = (s, a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } return s.replace(a, () => b); };

if (alvo === 'painel') {
  const f = base + '/src/pages/AtMetricas.jsx';
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('PROGRAMADO (criado) no periodo')) { console.log('painel ja aplicado'); process.exit(0); }
  s = rep(s, `    // 21/10: igual a extensao — ENVIADOS no periodo + PROGRAMADOS (pendentes), criados ate o fim da campanha.
    const contados = agendamentos.filter((a) => contas.includes(a.criadoPorId)
      && (a.status === 'enviado' || a.status === 'pendente')
      && !String(a.observacoes || '').includes('robo-') // lembrete criado pelo robo nao vale ponto
      && diaBR(a.criadoEm) <= campanha.ate && diaBR(a.enviarEm) >= campanha.de);
    const enviados = contados.filter((a) => a.status === 'enviado').length;
    const programados = contados.length - enviados;`,
`    // 21/10 (decisao do dono): todo agendamento PROGRAMADO (criado) no periodo da campanha, ja tenha saido ou nao.
    // Um por um; cancelado e lembrete criado pelo robo nao valem ponto.
    const contados = agendamentos.filter((a) => contas.includes(a.criadoPorId)
      && a.status !== 'cancelado'
      && !String(a.observacoes || '').includes('robo-')
      && diaBR(a.criadoEm) >= campanha.de && diaBR(a.criadoEm) <= campanha.ate);
    const enviados = contados.filter((a) => a.status === 'enviado').length;
    const programados = contados.length - enviados;`);
  s = rep(s, `<div className="entity-stat-label">{r.enviados} enviados + {r.programados} programados</div>`,
    `<div className="entity-stat-label">programados no período ({r.enviados} já saíram)</div>`);
  s = rep(s, `Agendamento = {pesos.agendamento} ponto (enviados no período + programados, igual à extensão de cada atendente)`,
    `Agendamento = {pesos.agendamento} ponto (cada agendamento programado no período, já tenha saído ou não)`);
  fs.writeFileSync(f, s); console.log('painel ok');
} else {
  const f = base + '/scripts/ranking-publico.js';
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('PROGRAMADO (criado) no periodo')) { console.log('script ja aplicado'); process.exit(0); }
  s = rep(s, `    // Igual a extensao: ENVIADOS no periodo + PROGRAMADOS (pendentes), criados ate o fim da campanha.
    const ags = await prisma.agendamento.findMany({
      where: { criadoPorId: { in: todas }, status: { in: ['enviado', 'pendente'] }, criadoEm: { lt: fim }, enviarEm: { gte: ini } },`,
`    // Decisao do dono (21/10): todo agendamento PROGRAMADO (criado) no periodo, ja tenha saido ou nao; um por um.
    const ags = await prisma.agendamento.findMany({
      where: { criadoPorId: { in: todas }, status: { not: 'cancelado' }, criadoEm: { gte: ini, lt: fim } },`);
  s = rep(s, `&& diaBR(a.criadoEm) <= c.ate && diaBR(a.enviarEm) >= c.de);`, `&& diaBR(a.criadoEm) >= c.de && diaBR(a.criadoEm) <= c.ate);`);
  fs.writeFileSync(f, s); console.log('script ok');
}
