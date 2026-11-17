// Lista as mensagens do usuario que tem imagem, com data, texto e tamanho de cada imagem.
const fs = require('fs');
const [, , arquivo, desde] = process.argv;
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
for (let i = 0; i < linhas.length; i++) {
  let o; try { o = JSON.parse(linhas[i]); } catch { continue; }
  if (o.message?.role !== 'user' || !Array.isArray(o.message.content)) continue;
  if (desde && String(o.timestamp || '') < desde) continue;
  const imgs = o.message.content.filter((b) => b.type === 'image');
  if (!imgs.length) continue;
  const txt = o.message.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').replace(/\s+/g, ' ').slice(0, 160);
  console.log(i, o.timestamp, imgs.map((b) => b.source?.data?.length || 0).join(','), '|', txt);
}
