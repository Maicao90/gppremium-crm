node /root/fix-vai-pensar.js
cp /root/whatsapp-crm/backend/data/cerebro/licoes.json /root/ant-lab/data/cerebro/licoes.json
cp /root/whatsapp-crm/backend/public/midias/bot-audios/josy-*.ogg /root/ant-lab/public/midias/bot-audios/ 2>/dev/null || true
bash /root/lab-start.sh > /dev/null 2>&1
for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3011/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "lab $c"
sed "s#127.0.0.1:3010#127.0.0.1:3011#" /root/teste-respostas.js > /root/teste-respostas-lab.js
nohup node /root/teste-respostas-lab.js > /root/teste-respostas-lab.log 2>&1 < /dev/null &
sleep 110
cat /root/teste-respostas-lab.log
