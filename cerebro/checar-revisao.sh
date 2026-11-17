L=/root/whatsapp-crm/logs/cerebro-revisao.log
timeout 560 sh -c "until tail -1 $L | grep -q 'achados novos'; do sleep 15; done"
tail -1 $L
cat > /tmp/checa.js <<'EOF'
const r = require('/root/whatsapp-crm/backend/data/cerebro/revisoes/2026-10-22.json');
const ac = {};
for (const a of r.achados) ac[a.sugestao.acao] = (ac[a.sugestao.acao] || 0) + 1;
console.log('acoes', JSON.stringify(ac));
const fixos = r.achados.filter((a) => a.sugestao.acao === 'responder' && /R\$\s?\d|\d{3}\/\d{2}/.test(a.sugestao.resposta));
console.log('texto fixo com preco/medida:', fixos.length);
for (const a of r.achados.slice(0, 5)) console.log('- quando o cliente ' + a.sugestao.situacao + ' -> ' + a.sugestao.acao + ': ' + a.sugestao.resposta.slice(0, 150));
EOF
node /tmp/checa.js
