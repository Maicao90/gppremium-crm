// 23/10 (dono): "joga 4 pontos acima pra cada um" — +4 stories (1 ponto cada) pra cada participante visivel do ranking.
const fs = require('fs');
const ARQ = '/root/whatsapp-crm/backend/public/anuncios/dados/pontuacao.json';
fs.copyFileSync(ARQ, `/root/pontuacao-antes-mais4-${Date.now()}.json`);
const p = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const escondidos = new Set([...(p.ocultar || []), ...Object.keys(p.juntar || {})]);
for (const [id, l] of Object.entries(p.lancamentos)) {
  if (escondidos.has(id)) continue;
  l.stories = (Number(l.stories) || 0) + 4;
  console.log(l.nome.trim(), '-> stories', l.stories, 'google', l.google);
}
p.atualizadoEm = '23/10/2026 (+4 pontos pra cada um, pedido do dono)';
fs.writeFileSync(ARQ, JSON.stringify(p, null, 1));
