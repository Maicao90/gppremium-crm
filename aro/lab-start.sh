# Sobe SO o bot-service do laboratorio (/root/ant-lab, porta 3011). Nao toca em producao.
cd /root/ant-lab || exit 1
# Config/licoes do robo: COPIA da producao (so leitura de la) pro lab ter o mesmo prompt e o mesmo cerebro.
mkdir -p data/cerebro
[ -f data/bot-pneus-config.json ] || cp /root/whatsapp-crm/backend/data/bot-pneus-config.json data/
[ -f data/bot-lojas.json ] || cp /root/whatsapp-crm/backend/data/bot-lojas.json data/ 2>/dev/null
[ -f data/cerebro/licoes.json ] || cp /root/whatsapp-crm/backend/data/cerebro/licoes.json data/cerebro/ 2>/dev/null
pkill -f "ant-lab/src/bot-service/server.ts" 2>/dev/null
sleep 1
set -a; . /root/whatsapp-crm/backend/.env; set +a
export BOT_SERVICE_PORT=3011 PORT=3011
nohup ./node_modules/.bin/ts-node --transpile-only /root/ant-lab/src/bot-service/server.ts > /tmp/lab-bot.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3011/health && break; sleep 2; done
curl -s -o /dev/null -w "lab %{http_code}\n" http://127.0.0.1:3011/health
tail -3 /tmp/lab-bot.log
