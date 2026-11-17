// Testes da conferencia contra 127.0.0.1:PORTA (servidor conf-server.ts, dados em copia).
require('/root/whatsapp-crm/backend/node_modules/dotenv').config({ path: '/root/whatsapp-crm/backend/.env', quiet: true });
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const PORTA = process.env.CONF_PORTA || 3016;
const base = `http://127.0.0.1:${PORTA}/api/cerebro`;
const tk = (role) => 'Bearer ' + jwt.sign({ sub: 'conf', role }, process.env.JWT_SECRET, { expiresIn: '5m' });
const req = async (met, p, role, body) => {
  const h = { 'content-type': 'application/json' }; if (role) h.authorization = tk(role);
  const r = await fetch(base + p, { method: met, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* */ }
  return { s: r.status, j };
};
(async () => {
  const so = process.argv[2];
  if (so === 'mapa') {
    const t0 = Date.now(); const r = await req('GET', '/mapa', 'gerente');
    console.log('mapa', r.s, Date.now() - t0, 'ms', 'uso=', JSON.stringify(r.j?.uso), 'nos=', r.j?.nos?.length);
    const txt = JSON.stringify(r.j || {});
    console.log('resposta contem DATABASE_URL/senha?', !!process.env.DATABASE_URL && (txt.includes(process.env.DATABASE_URL) || txt.includes(new URL(process.env.DATABASE_URL).password)));
    return;
  }
  console.log('sem token /mapa', (await req('GET', '/mapa')).s);
  console.log('vendedor /mapa', (await req('GET', '/mapa', 'vendedor')).s);
  const g = await req('GET', '/mapa', 'gerente');
  console.log('gerente /mapa', g.s, 'nos', g.j?.nos?.length, 'uso', JSON.stringify(g.j?.uso));
  const ens = (g.j?.nos || []).filter((n) => n.tipo === 'ensinamento');
  console.log('ensinamentos no mapa', ens.map((n) => `${n.id}=>${n.extra.ligadoA}${n.extra.ligadoAutomatico ? '(auto)' : ''}`).join(' | '));
  for (const p of ['/resumo']) console.log('gerente', p, (await req('GET', p, 'gerente')).s);
  console.log('gerente POST /licoes', (await req('POST', '/licoes', 'gerente', { situacao: 'perguntar x', acao: 'silencio' })).s);
  console.log('gerente PUT /licoes/x', (await req('PUT', '/licoes/x', 'gerente', {})).s);
  const ruins = ["categoria:remold'; drop table x;--", 'categoria:../../etc', 'etapa:PRECO', 'outro:remold', '<script>', 'categoria:' + 'a'.repeat(61), { $ne: 1 }, ['categoria:remold']];
  for (const v of ruins) {
    const r = await req('POST', '/licoes', 'admin', { situacao: 'perguntar teste conf injecao', acao: 'silencio', ligadoA: v });
    console.log('admin POST ligadoA', JSON.stringify(v).slice(0, 40), '->', r.s, 'gravou ligadoA =', JSON.stringify(r.j?.licao?.ligadoA));
  }
  const ok = await req('POST', '/licoes', 'master', { situacao: 'perguntar se entrega conf', acao: 'silencio', ligadoA: 'categoria:remold' });
  console.log('master POST ligadoA ok ->', ok.s, ok.j?.licao?.ligadoA);
  const id = ok.j?.licao?.id;
  const put1 = await req('PUT', `/licoes/${id}`, 'master', { ativo: false });
  console.log('PUT sem ligadoA mantem?', put1.s, put1.j?.licao?.ligadoA, 'ativo', put1.j?.licao?.ativo);
  const put2 = await req('PUT', `/licoes/${id}`, 'master', { ligadoA: '' });
  console.log('PUT ligadoA vazio limpa?', put2.s, JSON.stringify(put2.j?.licao?.ligadoA));
  const put3 = await req('PUT', `/licoes/${id}`, 'master', { ligadoA: 'etapa:preco' });
  console.log('PUT ligadoA etapa:preco', put3.s, put3.j?.licao?.ligadoA);
  const g2 = await req('GET', '/mapa', 'gerente');
  const n = (g2.j?.nos || []).find((x) => x.id === `ensinamento:${id}`);
  console.log('mapa apos PUT: ensinamento ligado a', n?.extra?.ligadoA, 'etapa', n?.etapa);
  const res = await req('GET', '/resumo', 'master');
  console.log('resumo licoes', res.j?.licoes?.length, 'chaves da antiga:', Object.keys((res.j?.licoes || []).find((l) => l.id === 'Lconfantiga') || {}).join(','));
  console.log('testar', (await req('POST', '/testar', 'master', { mensagem: 'oi' })).s);
  console.log('revisar (bloqueado no conf)', (await req('POST', '/revisar', 'master')).s);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
