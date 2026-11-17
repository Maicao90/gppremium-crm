// Extrai as imagens (base64) das mensagens do usuario que contem um termo, para a pasta indicada.
const fs = require('fs');
const path = require('path');
const [, , arquivo, termo, pasta] = process.argv;
fs.mkdirSync(pasta, { recursive: true });
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
let n = 0;
for (let i = 0; i < linhas.length; i++) {
  const l = linhas[i];
  if (!l.includes(termo)) continue;
  let o; try { o = JSON.parse(l); } catch { continue; }
  if (o.message?.role !== 'user' || !Array.isArray(o.message.content)) continue;
  // imagens na mesma mensagem ou nas mensagens do usuario logo antes/depois
  for (let j = Math.max(0, i - 4); j <= Math.min(linhas.length - 1, i + 4); j++) {
    let p; try { p = JSON.parse(linhas[j]); } catch { continue; }
    if (p.message?.role !== 'user' || !Array.isArray(p.message.content)) continue;
    for (const b of p.message.content) {
      const src = b.type === 'image' ? b.source : null;
      if (src?.type === 'base64') {
        const ext = (src.media_type || 'image/png').split('/')[1];
        const f = path.join(pasta, `linha${j}-${n++}.${ext}`);
        fs.writeFileSync(f, Buffer.from(src.data, 'base64'));
        console.log(f, fs.statSync(f).size);
      }
    }
  }
}
console.log('total', n);
