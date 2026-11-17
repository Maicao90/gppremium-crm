// lista as imagens que o usuario mandou na conversa (transcript), com horario e texto junto
const fs = require('fs');
const arq = process.argv[2];
const ls = fs.readFileSync(arq, 'utf8').split('\n');
let n = 0;
for (const l of ls) {
  let j; try { j = JSON.parse(l); } catch { continue; }
  if (j.type !== 'user') continue;
  const c = j.message && j.message.content;
  if (!Array.isArray(c)) continue;
  const imgs = c.filter((b) => b.type === 'image');
  if (!imgs.length) continue;
  const txt = c.filter((b) => b.type === 'text').map((b) => b.text).join(' ').slice(0, 160).replace(/\n/g, ' ');
  console.log(++n, j.timestamp, imgs.length + ' img', JSON.stringify(txt));
}
