// Acha a primeira linha com o termo e mostra os proximos textos do assistente (e textos do usuario).
const fs = require('fs');
const [, , arquivo, termo, max] = process.argv;
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
const ini = linhas.findIndex((l) => l.includes(termo));
console.log('linha', ini);
let n = 0;
for (let i = ini; i < linhas.length && n < Number(max || 8); i++) {
  let o; try { o = JSON.parse(linhas[i]); } catch { continue; }
  if (!Array.isArray(o.message?.content)) continue;
  for (const b of o.message.content) {
    if (b.type === 'text') { console.log(`--- ${o.message.role}:\n` + b.text.slice(0, 2500)); n++; }
  }
}
