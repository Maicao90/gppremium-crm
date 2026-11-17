// 21/10 (pedido do dono, print da extensao do Daniel): agendamento da campanha = o que a extensao mostra —
// ENVIADOS no periodo + PROGRAMADOS (pendentes). Sem "1 por cliente por dia".
// Regra estavel no tempo: criado ate o fim da campanha e com saida (enviarEm) a partir do inicio;
// enviado ou pendente (falhou/cancelado nao contam); lembrete do robo (observacoes 'robo-') fora.
const fs = require('fs');
const base = process.argv[2];
const alvo = process.argv[3];
const rep = (s, a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } return s.replace(a, () => b); };

if (alvo === 'painel') {
  const f = base + '/src/pages/AtMetricas.jsx';
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('ENVIADOS no periodo + PROGRAMADOS')) { console.log('painel ja aplicado'); process.exit(0); }
  s = rep(s, `    const unicos = new Set(agendamentos
      .filter((a) => contas.includes(a.criadoPorId) && a.status !== 'cancelado' && !String(a.observacoes || '').includes('robo-')) // lembrete criado pelo robo nao vale ponto
      .map((a) => [String(a.numero || '').replace(/\\D/g, ''), diaBR(a.criadoEm)])
      .filter(([, dia]) => dia >= campanha.de && dia <= campanha.ate)
      .map(([n, dia]) => n + '|' + dia));`,
`    // 21/10: igual a extensao — ENVIADOS no periodo + PROGRAMADOS (pendentes), criados ate o fim da campanha.
    const contados = agendamentos.filter((a) => contas.includes(a.criadoPorId)
      && (a.status === 'enviado' || a.status === 'pendente')
      && !String(a.observacoes || '').includes('robo-') // lembrete criado pelo robo nao vale ponto
      && diaBR(a.criadoEm) <= campanha.ate && diaBR(a.enviarEm) >= campanha.de);
    const enviados = contados.filter((a) => a.status === 'enviado').length;
    const programados = contados.length - enviados;`);
  s = rep(s, `    const ag = unicos.size;
    const stories = lancs`, `    const ag = contados.length;
    const stories = lancs`);
  s = rep(s, `return { id: u.id, nome: (campanha.nomes || {})[u.id] || u.nome,`, `return { id: u.id, enviados, programados, nome: (campanha.nomes || {})[u.id] || u.nome,`);
  s = rep(s, `<td data-label="Agendamentos">{r.ag} <span className="entity-stat-label">({r.ag * pesos.agendamento} pts)</span></td>`,
    `<td data-label="Agendamentos">{r.ag} <span className="entity-stat-label">({r.ag * pesos.agendamento} pts)</span><div className="entity-stat-label">{r.enviados} enviados + {r.programados} programados</div></td>`);
  s = rep(s, `Agendamento = {pesos.agendamento} ponto (1 por cliente por dia, contado pela extensão de cada atendente)`,
    `Agendamento = {pesos.agendamento} ponto (enviados no período + programados, igual à extensão de cada atendente)`);
  fs.writeFileSync(f, s); console.log('painel ok');
} else {
  const f = base + '/scripts/ranking-publico.js';
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('ENVIADOS no periodo + PROGRAMADOS')) { console.log('script ja aplicado'); process.exit(0); }
  s = rep(s, `    const ags = await prisma.agendamento.findMany({
      where: { criadoPorId: { in: todas }, status: { not: 'cancelado' }, criadoEm: { gte: ini, lt: fim } },
      select: { criadoPorId: true, numero: true, criadoEm: true, observacoes: true },
    });`,
`    // Igual a extensao: ENVIADOS no periodo + PROGRAMADOS (pendentes), criados ate o fim da campanha.
    const ags = await prisma.agendamento.findMany({
      where: { criadoPorId: { in: todas }, status: { in: ['enviado', 'pendente'] }, criadoEm: { lt: fim }, enviarEm: { gte: ini } },
      select: { criadoPorId: true, status: true, criadoEm: true, enviarEm: true, observacoes: true },
    });`);
  s = rep(s, `      const unicos = new Set(ags
        .filter((a) => contas.includes(a.criadoPorId) && !String(a.observacoes || '').includes('robo-'))
        .map((a) => [String(a.numero || '').replace(/\\D/g, ''), diaBR(a.criadoEm)])
        .filter(([, dia]) => dia >= c.de && dia <= c.ate)
        .map(([n, dia]) => n + '|' + dia));`,
`      const contados = ags.filter((a) => contas.includes(a.criadoPorId) && !String(a.observacoes || '').includes('robo-')
        && diaBR(a.criadoEm) <= c.ate && diaBR(a.enviarEm) >= c.de);
      const enviados = contados.filter((a) => a.status === 'enviado').length;`);
  s = rep(s, `      const ag = unicos.size;`, `      const ag = contados.length;`);
  s = rep(s, `        agendamentos: ag, stories, google,`, `        agendamentos: ag, enviados, programados: ag - enviados, stories, google,`);
  fs.writeFileSync(f, s); console.log('script ok');
}
