const fs = require('fs');
const F = '/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json';
const d = JSON.parse(fs.readFileSync(F, 'utf8'));
const novos = {
  '0533e6e3-53f1-4282-b2c2-67bfe7867b0f': { s: 32, g: 5 },  // José Ângelo
  '60e58df4-8f3a-4493-94a6-11953546e826': { s: 31, g: 3 },  // Camila
  '750cdab9-1edd-43b9-9543-18b2f8b7c229': { s: 10, g: 11 }, // Super Via
  '34268c16-7bed-400a-bf1e-a3d9e37d8774': { s: 0, g: 8 },   // josy / Pneus GP Premium
};
const BONUS = 5, HOJE = '2026-10-28';
for (const [id, n] of Object.entries(novos)) {
  const l = d.lancamentos[id];
  l.stories += n.s; l.google += n.g;
}
if (d.bonusDiarioEm !== HOJE) {
  const ocultar = new Set(d.ocultar || []);
  const juntar = new Set(Object.keys(d.juntar || {}));
  for (const [id, l] of Object.entries(d.lancamentos)) {
    if (ocultar.has(id) || juntar.has(id)) continue;
    l.stories += BONUS;
  }
  d.bonusDiarioEm = HOJE;
}
d.ate = HOJE;
d.ultimaContagem = process.argv[2];
d.atualizadoEm = '28/10/2026 (grupo Posts/Avaliações até 27/10 + 5 pontos pra cada um)';
fs.writeFileSync(F, JSON.stringify(d, null, 1));
console.log(JSON.stringify(d.lancamentos, null, 1));
