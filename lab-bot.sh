cd /root/ant-lab
grep -n "listen(" src/bot-service/server.ts | head -2
pkill -f "ant-lab/src/bot-service/server.ts" 2>/dev/null
set -a; . /root/whatsapp-crm/backend/.env; set +a
export BOT_SERVICE_PORT=3011 PORT=3011
nohup ./node_modules/.bin/ts-node --transpile-only /root/ant-lab/src/bot-service/server.ts > /tmp/lab-bot.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3011/health && break; sleep 2; done
curl -s -o /dev/null -w "lab %{http_code}\n" http://127.0.0.1:3011/health
node /root/teste-auditoria.js
