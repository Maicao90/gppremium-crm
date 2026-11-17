const fs = require('fs');
const r = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/data/cerebro/revisoes/2026-10-22.json', 'utf8'));
const p = (r.achados || []).filter((a) => a.status === 'pendente');
console.log('pendentes', p.length, 'de', (r.achados || []).length);
for (const a of p) {
  const s = a.sugestao || {};
  const preco = /R\$\s?\d|\d{3}\/\d{2}/.test(s.resposta || '') ? ' <<PRECO>>' : '';
  console.log(`- ${a.id} [${a.tipo}] ${s.acao}${preco}\n   quando: ${String(s.situacao).slice(0, 140)}\n   > ${String(s.resposta).slice(0, 200).replace(/\n/g, ' / ')}`);
}
