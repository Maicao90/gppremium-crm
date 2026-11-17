set -e
B=/root/whatsapp-crm/backend
L=/root/ant-lab
ARQS="src/data/medidaJuntada.ts src/bot-service/server.ts src/data/tabelaPrecos.ts"
ts=$(date +%s)
cd $B && tar -cf /root/backup-aro-$ts.tar src/bot-service/server.ts src/data/tabelaPrecos.ts
cd $L && cp --parents $ARQS $B/
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_OK
cd /root/whatsapp-crm && git add $(for a in $ARQS; do echo backend/$a; done)
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: junta medida mandada em pedacos (195/55 + aro 16) e pede so o aro quando falta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log -1 --format=%h
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
# conferencia na producao (so gera a resposta, teste:true — nada vai pro WhatsApp)
sed "s#127.0.0.1:3011#127.0.0.1:3010#" /root/gp-aro/teste-aro.js > /root/gp-aro/teste-aro-prod.js
cd /root/gp-aro && node teste-aro-prod.js REAL && node teste-aro-prod.js "(c)" && node teste-aro-prod.js "(d2)"
tail -5 /root/whatsapp-crm/logs/bot-service-error.log 2>/dev/null | grep -a "$(date -u +%Y-%m-%d)" || echo "sem erro novo no bot-service"
