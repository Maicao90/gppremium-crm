set -e
cd /root/whatsapp-crm
git add backend/src/bot-service/server.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: nao fica sem responder quando a conversa termina com a loja nem com print PNG rotulado como JPEG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log -1 --format=%h
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
cd /root/gp-aro && node teste-aro-prod.js "(c)" | tail -3
