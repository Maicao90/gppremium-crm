// Le sim-resultado.jsonl (rodado com SIMCONF=1) e mostra o que o conferente fez. Uso: node analisa-conferente.js [arquivo] [max exemplos]
const fs = require('fs');
const arq = process.argv[2] || 'sim-resultado.jsonl';
const max = Number(process.argv[3] || 40);
const cont = {}; const exemplos = []; let total = 0, conferidas = 0, msTotal = 0, msMax = 0;
for (const l of fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean)) {
  let c; try { c = JSON.parse(l); } catch { continue; }
  for (const p of c.p || []) {
    total++;
    if (!p.conf) continue;
    conferidas++;
    const v = p.conf.veredito; cont[v] = (cont[v] || 0) + 1;
    msTotal += p.conf.ms || 0; msMax = Math.max(msMax, p.conf.ms || 0);
    if (v !== 'ok') exemplos.push({ v, tipo: p.conf.tipo, problema: p.conf.problema, cliente: (p.cliente || []).join(' / ').slice(0, 160), antes: (p.antes || []).slice(-2).join(' | ').slice(0, 200), original: (p.conf.original || []).join(' / ').slice(0, 260), nova: (p.partes || []).join(' / ').slice(0, 260) });
  }
}
console.log(`respostas: ${total} | conferidas: ${conferidas} | tempo medio ${conferidas ? Math.round(msTotal / conferidas) : 0}ms (max ${msMax}ms)`);
console.log('vereditos:', JSON.stringify(cont));
for (const e of exemplos.slice(0, max)) {
  console.log(`\n[${e.v}/${e.tipo}] ${e.problema}\n  ANTES: ${e.antes}\n  CLIENTE: ${e.cliente}\n  ORIGINAL: ${e.original}\n  SAIU: ${e.nova}`);
}
