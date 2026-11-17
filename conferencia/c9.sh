mkdir -p /root/gp-aro/conf
ps -o pid,lstart,args -p $(pgrep -f "ant-lab/src/bot-service/server.ts" | head -1) 2>/dev/null
stat -c '%y %n' /root/ant-lab/src/bot-service/server.ts /root/ant-lab/src/data/medidaJuntada.ts /root/ant-lab/src/data/tabelaPrecos.ts
cd /root/ant-lab && ./node_modules/.bin/tsc --noEmit -p . 2>&1 | tail -20; echo "tsc exit ${PIPESTATUS[0]}"
