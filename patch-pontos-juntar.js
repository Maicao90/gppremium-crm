// 21/10: ranking da campanha — juntar atendentes numa linha (Daniel/Diogo), ocultar contas (Borracharia)
// e mostrar quantos pontos vieram de cada coisa. Tudo configurado no dados/pontuacao.json.
const fs = require('fs');
const f = process.argv[2] + '/src/pages/AtMetricas.jsx';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('campanha?.juntar')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };
rep(`  const ranking = campanha ? metricas.filter((u) => idsAtendentes.has(u.id)).map((u) => {
    const unicos = new Set(agendamentos
      .filter((a) => a.criadoPorId === u.id && a.status !== 'cancelado'`,
`  // pontuacao.json: "juntar" { idQueSome: idQueRecebe } soma duas contas numa linha so (ex.: Diogo -> Daniel),
  // "ocultar" [ids] tira do ranking e "nomes" { id: 'Daniel/Diogo' } troca o nome exibido.
  const juntar = campanha?.juntar || {};
  const ocultar = new Set([...(campanha?.ocultar || []), ...Object.keys(juntar)]);
  const contasDe = (id) => [id, ...Object.keys(juntar).filter((k) => juntar[k] === id)];
  const ranking = campanha ? metricas.filter((u) => idsAtendentes.has(u.id) && !ocultar.has(u.id)).map((u) => {
    const contas = contasDe(u.id);
    const unicos = new Set(agendamentos
      .filter((a) => contas.includes(a.criadoPorId) && a.status !== 'cancelado'`);
rep(`    const lanc = (campanha.lancamentos || {})[u.id] || {};
    const ag = unicos.size;
    const stories = Number(lanc.stories) || 0;
    const google = Number(lanc.google) || 0;
    return { id: u.id, nome: u.nome,`,
`    const lancs = contas.map((id) => (campanha.lancamentos || {})[id] || {});
    const ag = unicos.size;
    const stories = lancs.reduce((t, l) => t + (Number(l.stories) || 0), 0);
    const google = lancs.reduce((t, l) => t + (Number(l.google) || 0), 0);
    return { id: u.id, nome: (campanha.nomes || {})[u.id] || u.nome,`);
rep(`<td data-label="Agendamentos">{r.ag}</td>
                      <td data-label="Stories">{r.stories}</td>`,
`<td data-label="Agendamentos">{r.ag} <span className="entity-stat-label">({r.ag * pesos.agendamento} pts)</span></td>
                      <td data-label="Stories">{r.stories} <span className="entity-stat-label">({r.stories * pesos.story} pts)</span></td>`);
rep(`<td data-label="Pontos"><strong style={{ color: 'var(--accent-color)' }}>{r.total}</strong></td>`,
`<td data-label="Pontos"><strong style={{ color: 'var(--accent-color)' }}>{r.total}</strong>
                        <div className="entity-stat-label">{r.ag * pesos.agendamento} agend. + {r.stories * pesos.story} story + {r.google * pesos.google} Google</div></td>`);
fs.writeFileSync(f, s); console.log('ok');
