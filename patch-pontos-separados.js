// 21/10: ranking da campanha mostra quantos pontos vieram de cada coisa (agendamento, story, Google).
const fs = require('fs');
const f = process.argv[2] + '/src/pages/AtMetricas.jsx';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('pontos de agendamento')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };
rep(`<td data-label="Agendamentos">{r.ag}</td>
                      <td data-label="Stories">{r.stories}</td>`,
`<td data-label="Agendamentos">{r.ag} <span className="entity-stat-label">({r.ag * pesos.agendamento} pts)</span></td>
                      <td data-label="Stories">{r.stories} <span className="entity-stat-label">({r.stories * pesos.story} pts)</span></td>`);
rep(`<td data-label="Pontos"><strong style={{ color: 'var(--accent-color)' }}>{r.total}</strong></td>`,
`<td data-label="Pontos"><strong style={{ color: 'var(--accent-color)' }}>{r.total}</strong>
                        <div className="entity-stat-label" title="pontos de agendamento + story + Google">{r.ag * pesos.agendamento} agend. + {r.stories * pesos.story} story + {r.google * pesos.google} Google</div></td>`);
fs.writeFileSync(f, s); console.log('ok');
