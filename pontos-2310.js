// 23/10: contagem do grupo Posts/Avaliacoes de 21/10 14h ate 22/10 19:30 (85 fotos conferidas uma a uma).
const fs = require('fs');
const f = '/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json';
fs.copyFileSync(f, `/root/pontuacao-antes-2310-${Date.now()}.json`);
const p = JSON.parse(fs.readFileSync(f, 'utf8'));
const novos = {
  '60e58df4-8f3a-4493-94a6-11953546e826': { stories: 24, google: 13 }, // Camila
  '0533e6e3-53f1-4282-b2c2-67bfe7867b0f': { stories: 36, google: 2 },  // Jose Angelo
  '34268c16-7bed-400a-bf1e-a3d9e37d8774': { stories: 0, google: 10 },  // Josy (Pneus GP Premium)
  '750cdab9-1edd-43b9-9543-18b2f8b7c229': { stories: 0, google: 1 },   // Daniel/Diogo (supervia)
};
for (const [id, n] of Object.entries(novos)) {
  const l = p.lancamentos[id];
  l.stories += n.stories; l.google += n.google;
  console.log(l.nome.trim(), 'stories', l.stories, 'google', l.google);
}
p.ultimaContagem = '2026-10-22T19:30:00-03:00';
p.atualizadoEm = '23/10/2026 (grupo Posts/Avaliações até 22/10 19h30 + 4 pontos pra cada um)';
fs.writeFileSync(f, JSON.stringify(p, null, 1));
