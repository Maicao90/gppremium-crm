// salva as imagens que o usuario mandou depois de uma data (transcript) em arquivos, pra conferir
const fs = require('fs');
const [arq, desde, pasta] = process.argv.slice(2);
fs.mkdirSync(pasta, { recursive: true });
let n = 0;
for (const l of fs.readFileSync(arq, 'utf8').split('\n')) {
  let j; try { j = JSON.parse(l); } catch { continue; }
  if (j.type !== 'user' || !j.timestamp || j.timestamp < desde) continue;
  const c = j.message && j.message.content;
  if (!Array.isArray(c)) continue;
  for (const b of c) {
    if (b.type !== 'image' || !b.source || !b.source.data) continue;
    const ext = (b.source.media_type || 'image/png').split('/')[1];
    const nome = `${j.timestamp.replace(/[:.]/g, '-')}-${++n}.${ext}`;
    fs.writeFileSync(`${pasta}/${nome}`, Buffer.from(b.source.data, 'base64'));
    console.log(nome);
  }
}
