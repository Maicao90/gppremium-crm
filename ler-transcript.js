// Le o transcript da sessao e mostra o que aconteceu depois de uma mensagem do usuario.
const fs = require('fs');
const [, , arquivo, busca, max] = process.argv;
const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
let idx = -1;
for (let i = 0; i < linhas.length; i++) {
  if (linhas[i].includes(busca) && linhas[i].includes('"role":"user"')) { idx = i; break; }
}
console.log('idx', idx);
let n = 0;
for (let i = idx + 1; i < linhas.length && n < Number(max || 40); i++) {
  let o; try { o = JSON.parse(linhas[i]); } catch { continue; }
  const c = o.message && o.message.content;
  if (!Array.isArray(c)) continue;
  for (const b of c) {
    if (b.type === 'text' && o.message.role === 'assistant') { console.log('A:', b.text.slice(0, 900)); n++; }
    if (b.type === 'tool_use') { console.log('T:', JSON.stringify(b.input).slice(0, 400)); n++; }
    if (b.type === 'tool_result') { const t = typeof b.content === 'string' ? b.content : JSON.stringify(b.content); console.log('R:', t.slice(0, 400)); n++; }
  }
}
