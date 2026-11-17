// confere se /api/agendamentos devolve observacoes (precisa pro filtro do robo) e a conta da Josy em outubro sem o robo
const fs = require('fs');
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const s = (fs.readFileSync('/root/whatsapp-crm/backend/.env', 'utf8').match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const t = jwt.sign({ sub: '40f92000-0000-0000-0000-000000000000', role: 'master' }, s, { expiresIn: '5m' });
(async () => {
  const r = await fetch('https://crm.nailacademyprofissional.com/api/agendamentos', { headers: { authorization: 'Bearer ' + t } });
  const l = await r.json();
  const J = '34268c16-7bed-400a-bf1e-a3d9e37d8774';
  const comObs = l.filter((a) => 'observacoes' in a).length;
  const out = l.filter((a) => a.criadoPorId === J && a.enviarEm >= '2026-10-01T03' && a.enviarEm < '2026-11-01T03');
  const semRobo = out.filter((a) => !String(a.observacoes || '').includes('robo-'));
  console.log('status', r.status, 'total', l.length, 'com campo observacoes', comObs, '| josy out:', out.length, 'sem robo:', semRobo.length, 'enviados:', semRobo.filter((a) => a.status === 'enviado').length);
})();
