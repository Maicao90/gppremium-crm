const fs = require('fs');
const f = '/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json';
const p = JSON.parse(fs.readFileSync(f, 'utf8'));
p.bonusDiarioEm = '2026-10-23';
p.ultimaContagem = '2026-10-21T16:45:00-03:00';
fs.writeFileSync(f, JSON.stringify(p, null, 1));
console.log(p.bonusDiarioEm, p.ultimaContagem);
