set -e
B=/root/whatsapp-crm/backend
cp $B/src/bot-service/server.ts /root/server.ts.bak-sim-$(date +%s)
python3 /root/fix-sim.py $B/src/bot-service/server.ts
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_OK
cd /root/whatsapp-crm && git add backend/src/bot-service/server.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: 'sim' respondendo a mensagem de retomada vale como a medida da mensagem (preco pela tabela)" && git log -1 --format=%h
pm2 reload bot-service --update-env > /dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
