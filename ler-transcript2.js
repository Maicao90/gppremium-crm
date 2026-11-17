// Mostra os textos do assistente que citam um termo.
const fs = require('fs');
const [, , arquivo, termo] = process.argv;
for (const l of fs.readFileSync(arquivo, 'utf8').split('\n')) {
  let o; try { o = JSON.parse(l); } catch { continue; }
  if (o.message?.role !== 'assistant' || !Array.isArray(o.message.content)) continue;
  for (const b of o.message.content) if (b.type === 'text' && b.text.includes(termo)) console.log('---\n' + b.text.slice(0, 1500));
}
