cd /root/lab-robo-1711
[ -f .env ] || cp /root/whatsapp-crm/backend/.env .env 2>/dev/null
if [ "$1" = "reinicia" ]; then
  P=$(ss -ltnp 2>/dev/null | grep "127.0.0.1:3019 " | grep -o "pid=[0-9]*" | head -1 | cut -d= -f2)
  [ -n "$P" ] && kill "$P" && echo "lab antigo (pid $P) encerrado"
  for i in 1 2 3 4 5; do sleep 1; curl -s -m 1 http://127.0.0.1:3019/health >/dev/null || break; done
fi
if ! curl -s -m 3 http://127.0.0.1:3019/health >/dev/null; then
  BOT_LAB_1711=1 BOT_SERVICE_PORT=3019 nohup ./node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/bot-service/server.ts > lab.log 2>&1 &
  for i in $(seq 1 45); do sleep 2; curl -s -m 2 http://127.0.0.1:3019/health >/dev/null && break; done
fi
curl -s -m 3 http://127.0.0.1:3019/health || { echo "LAB NAO SUBIU"; tail -20 lab.log | cut -c1-300; exit 1; }
echo
sed -i "s#127.0.0.1:3010#127.0.0.1:3019#" regressao.js
echo "=== BATERIA ANTIGA"; node regressao.js 2>&1 | grep -E "FALHOU|passaram|acao=" | cut -c1-330
echo "=== CASOS NOVOS"; node roda.js 2>&1
