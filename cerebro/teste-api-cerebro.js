// Teste ponta a ponta da API do Cerebro no servidor (token temporario de administrador, 10 min).
require('dotenv').config({ path: '/root/whatsapp-crm/backend/.env' });
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const token = jwt.sign({ sub: 'teste-cerebro', role: 'master', lojaId: null, modulos: [] }, process.env.JWT_SECRET, { expiresIn: '10m' });
const B = 'https://crm.nailacademyprofissional.com/api/cerebro';
const h = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
const chamar = (p, o = {}) => fetch(B + p, { ...o, headers: h }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
(async () => {
  const r1 = await chamar('/resumo');
  console.log('resumo', r1.status, 'licoes', r1.body?.licoes?.length, 'revisoes', JSON.stringify(r1.body?.revisoes?.slice(0, 2)), 'rodando', !!r1.body?.rodando, 'lojas', r1.body?.lojas?.map((l) => l.nome).join(', '));
  const nova = await chamar('/licoes', { method: 'POST', body: JSON.stringify({ situacao: 'perguntar se a loja entrega o pneu em casa', acao: 'responder', resposta: 'A gente não faz entrega, mas a montagem aqui na loja é grátis e rapidinha 😊\n\nQuer que eu te mande a localização?', lojas: [] }) });
  console.log('criar', nova.status, nova.body?.licao?.id);
  for (const m of ['vocês entregam em casa?', 'quanto tá o 175/70/14?']) {
    const t = await chamar('/testar', { method: 'POST', body: JSON.stringify({ mensagem: m }) });
    console.log(`testar "${m}"`, t.status, 'via', t.body?.via, '|', (t.body?.partes || []).join(' / '));
  }
  const del = await chamar(`/licoes/${nova.body?.licao?.id}`, { method: 'DELETE' });
  console.log('apagar', del.status);
  const semToken = await fetch(B + '/resumo').then((r) => r.status);
  console.log('sem token', semToken);
})();
