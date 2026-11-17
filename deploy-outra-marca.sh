set -e
cd /root/whatsapp-crm/backend
grep -n "function lerJson" -A6 src/services/botLojas.ts | head -8
ts=$(date +%s)
tar -cf /root/backup-outra-marca-$ts.tar src/data/fluxoPrecoExtrator.ts src/bot-service/server.ts data/bot-lojas.json
cp /root/ant-lab/src/data/fluxoPrecoExtrator.ts src/data/
cp /root/ant-lab/src/bot-service/server.ts src/bot-service/
./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
cat > /tmp/gp-chaves.js <<'EOF'
const fs = require('fs');
const f = '/root/whatsapp-crm/backend/data/bot-lojas.json';
const j = JSON.parse(fs.readFileSync(f, 'utf8'));
const g = j['72213a6c-31c5-410d-a6b4-504dfd223e2f'];
g.CHAVES_ATENDENTE = Array.from(new Set([...(g.CHAVES_ATENDENTE || []), 'outra_marca']));
fs.writeFileSync(f, JSON.stringify(j, null, 2));
console.log('GP CHAVES_ATENDENTE', g.CHAVES_ATENDENTE);
EOF
node /tmp/gp-chaves.js
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
cd /root/whatsapp-crm && git add backend/src/data/fluxoPrecoExtrator.ts backend/src/bot-service/server.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: cliente que fala de outra marca do orcamento da atendente (ex.: Comforser) = outra marca -> so um instante + etiqueta; contexto mostra o orcamento inteiro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
