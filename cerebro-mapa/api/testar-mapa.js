// Testa GET /api/cerebro/mapa no lab (127.0.0.1:3015) com um token de painel assinado localmente.
require('/root/whatsapp-crm/backend/node_modules/dotenv').config({ path: '/root/whatsapp-crm/backend/.env', quiet: true });
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const base = 'http://127.0.0.1:3015/api/cerebro';
(async () => {
  const lixo = await fetch(base + '/mapa', { headers: { authorization: 'Bearer token-invalido' } });
  console.log('token invalido ->', lixo.status);
  const vendedor = jwt.sign({ sub: 'lab', role: 'vendedor' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  console.log('vendedor ->', (await fetch(base + '/mapa', { headers: { authorization: 'Bearer ' + vendedor } })).status);
  const token = jwt.sign({ sub: 'lab', role: 'gerente' }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const t0 = Date.now();
  const r = await fetch(base + '/mapa', { headers: { authorization: 'Bearer ' + token } });
  const j = await r.json();
  const t1 = Date.now();
  await fetch(base + '/mapa', { headers: { authorization: 'Bearer ' + token } });
  const t2 = Date.now();
  console.log('gerente ->', r.status, `1a chamada ${t1 - t0} ms, 2a (cache) ${t2 - t1} ms, ${JSON.stringify(j).length} bytes`);
  console.log('gerente tentando ensinar ->', (await fetch(base + '/licoes', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: '{}' })).status);
  console.log('revisar no lab ->', (await fetch(base + '/revisar', { method: 'POST' })).status);
  if (!r.ok) { console.log(j); return; }
  console.log('uso', j.uso, 'revisao', j.revisao);
  const porTipo = {}; for (const n of j.nos) porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1;
  const ligTipo = {}; for (const l of j.ligacoes) ligTipo[l.tipo] = (ligTipo[l.tipo] || 0) + 1;
  console.log('nos por tipo', porTipo, 'ligacoes por tipo', ligTipo);
  console.log('etapas:'); for (const n of j.nos.filter((n) => n.tipo === 'etapa')) console.log('  ', n.id, 'hoje', n.usosHoje, '7d', n.usos7d);
  console.log('top categorias:'); for (const n of j.nos.filter((n) => n.tipo === 'categoria').sort((a, b) => b.usos7d - a.usos7d).slice(0, 10)) console.log('  ', n.id, n.etapa, 'hoje', n.usosHoje, '7d', n.usos7d);
  console.log('top sinapses:'); for (const l of j.ligacoes.filter((l) => l.tipo === 'caminho').sort((a, b) => b.peso - a.peso).slice(0, 10)) console.log('  ', l.de, '->', l.para, l.peso);
  console.log('etapa->etapa:'); for (const l of j.ligacoes.filter((l) => l.tipo === 'etapa')) console.log('  ', l.de, '->', l.para, l.peso);
  console.log('ensinamentos:'); for (const n of j.nos.filter((n) => n.tipo === 'ensinamento')) console.log('  ', n.rotulo, '=>', n.extra.ligadoA, n.extra.ligadoAutomatico ? '(auto)' : '(escolhido)');
  console.log('achados:'); for (const n of j.nos.filter((n) => n.tipo === 'achado')) console.log('  ', n.extra.achado.tipo, '|', n.rotulo.slice(0, 60), '=>', n.extra.ligadoA, `(${n.extra.ligadoPor})`);
  const ids = new Set(j.nos.map((n) => n.id)); const soltas = j.ligacoes.filter((l) => !ids.has(l.de) || !ids.has(l.para));
  console.log('ligacoes apontando pra no inexistente:', soltas.length);
  console.log('textos editados:', j.nos.filter((n) => n.extra?.textosLoja?.length).map((n) => n.extra.chave + ':' + n.extra.textosLoja.map((t) => t.loja).join('/')).join(', '));
  console.log('amostra no:', JSON.stringify(j.nos.find((n) => n.id === 'categoria:remold')).slice(0, 600));
  require('fs').writeFileSync('/root/cerebro-lab-api/mapa-amostra.json', JSON.stringify(j, null, 1));
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
