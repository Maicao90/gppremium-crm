// mostra os trechos do transcript que falam da tabela nova / TAB.7 (texto do assistente e resultados de ferramenta)
const fs = require('fs');
const ls = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const alvo = /TAB\.?7|tabela nova|nova tabela|foto.{0,30}tabela/i;
for (let i = 84000; i < ls.length; i++) {
  if (!alvo.test(ls[i])) continue;
  let j; try { j = JSON.parse(ls[i]); } catch { continue; }
  const c = j.message && j.message.content;
  const partes = Array.isArray(c) ? c : [{ type: 'text', text: String(c || '') }];
  for (const b of partes) {
    const t = b.type === 'text' ? b.text : b.type === 'tool_result' ? JSON.stringify(b.content) : b.type === 'tool_use' ? JSON.stringify(b.input) : '';
    const m = t && t.match(alvo);
    if (!m) continue;
    const k = Math.max(0, m.index - 300);
    console.log(`--- linha ${i} ${j.type} ${j.timestamp || ''}\n${t.slice(k, k + 700).replace(/\\n/g, '\n')}\n`);
  }
}
