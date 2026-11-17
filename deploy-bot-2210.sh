set -e
pkill -f "ant-lab/src/bot-service/server.ts" 2>/dev/null || true
B=/root/whatsapp-crm/backend
ARQS="src/bot-service/server.ts src/data/fluxoPreco.ts src/data/tabelaPrecos.ts src/data/fluxoPrecoExtrator.ts"
ts=$(date +%s)
cd $B && tar -cf /root/backup-bot-2210-$ts.tar $ARQS
cd /root/ant-lab && cp --parents $ARQS $B/
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
sed -i 's#127.0.0.1:3011#127.0.0.1:3010#' /root/teste-auditoria.js
node /root/teste-auditoria.js | grep -A3 "^# \"14\"\|^# anuncio Brutus\|^# \"O Brutus\""
cd /root/whatsapp-crm && git add $(for a in $ARQS; do echo backend/$a; done) && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo (revisao das conversas 21-22/10): exemplo da pergunta nao vira medida; aro sozinho pergunta o carro; modelo citado (Brutus) define o preco; JSON em lista nao vaza; medida na rajada nao pede medida; 'ainda tem?' e disponibilidade

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
