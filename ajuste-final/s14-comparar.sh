D=/root/gp-aro/ajuste-final
A=/root/ant-lab-antes
rm -rf $A; mkdir -p $A
cp -r /root/ant-lab/package.json /root/ant-lab/tsconfig.json /root/ant-lab/prisma /root/ant-lab/data $A/
ln -s /root/whatsapp-crm/backend/node_modules $A/node_modules
cp -r /root/whatsapp-crm/backend/src $A/src
set -a; . /root/whatsapp-crm/backend/.env; set +a
export BOT_SERVICE_PORT=3012 PORT=3012
cd $A
nohup ./node_modules/.bin/ts-node --transpile-only $A/src/bot-service/server.ts > /tmp/lab-antes.log 2>&1 &
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3012/health && break; sleep 2; done
curl -s -o /dev/null -w "antes(3012) %{http_code}\n" http://127.0.0.1:3012/health
curl -s -o /dev/null -w "lab(3011) %{http_code}\n" http://127.0.0.1:3011/health
cd $D
LAB_PORT=3012 node teste-marcelo.js 2 > antes-marcelo.txt 2>&1
LAB_PORT=3012 node teste-troca-aro.js "" 2 > antes-troca.txt 2>&1
LAB_PORT=3011 node teste-marcelo.js 2 > depois-marcelo.txt 2>&1
LAB_PORT=3011 node teste-troca-aro.js "" 2 > depois-troca.txt 2>&1
pkill -f "ant-lab-antes/src/bot-service/server.ts"
grep -a "TRAVA POS-ORCAMENTO\|troca de aro" /tmp/lab-bot.log > depois-log.txt
echo FIM
