cd /root/whatsapp-crm/backend
echo "=== cerebro.ts"; cat -n src/bot-service/cerebro.ts
echo "=== server.ts"; wc -l src/bot-service/server.ts; grep -n "cerebro\|app.use\|listen\|import\|log(" src/bot-service/server.ts | head -80
echo "=== licoes.json"; head -c 3000 data/cerebro/licoes.json
echo; echo "=== revisao"; head -c 5000 data/cerebro/revisoes/2026-10-22.json
echo; echo "=== log size"; ls -la /root/whatsapp-crm/logs/bot-service.log
echo "=== log tail"; tail -n 80 /root/whatsapp-crm/logs/bot-service.log | cut -c1-300
