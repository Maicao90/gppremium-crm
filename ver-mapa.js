// confere a rota do mapa do cerebro como o painel chama (token de gerente gerado aqui, so leitura)
const fs = require('fs');
const jwt = require('/root/whatsapp-crm/backend/node_modules/jsonwebtoken');
const ENV = fs.readFileSync('/root/whatsapp-crm/backend/.env', 'utf8');
const s = (ENV.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const t = jwt.sign({ sub: 'conferencia', role: 'gerente' }, s, { expiresIn: '5m' });
(async () => {
  for (const u of ['mapa', 'resumo', 'aprendizado']) {
    const r = await fetch('https://crm.nailacademyprofissional.com/api/cerebro/' + u, { headers: { authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => null);
    if (u === 'mapa') {
      const tipos = {};
      for (const n of j?.nos || []) tipos[n.tipo] = (tipos[n.tipo] || 0) + 1;
      console.log('mapa', r.status, 'nos', (j?.nos || []).length, JSON.stringify(tipos), 'ligacoes', (j?.ligacoes || []).length, j?.error || '');
    } else console.log(u, r.status, JSON.stringify(j).slice(0, 150));
  }
})();
