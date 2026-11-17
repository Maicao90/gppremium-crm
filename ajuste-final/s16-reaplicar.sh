D=/root/gp-aro/ajuste-final
L=/root/ant-lab/src
cp $D/novo/server.ts $L/bot-service/server.ts
cp $D/novo/travaPosOrcamento.ts $L/data/travaPosOrcamento.ts
cd /root/ant-lab
./node_modules/.bin/tsc --noEmit -p . > $D/tsc-depois.txt 2>&1; echo "tsc exit=$?"; cat $D/tsc-depois.txt
cd $D
/root/ant-lab/node_modules/.bin/ts-node --transpile-only --project /root/ant-lab/tsconfig.json teste-unit.ts > unit.txt 2>&1; echo "unit exit=$?"; tail -12 unit.txt
bash /root/lab-start.sh
LAB_PORT=3011 node teste-marcelo.js 2 > depois-marcelo.txt 2>&1
LAB_PORT=3011 node teste-marcelo.js 2 >> depois-marcelo.txt 2>&1
cat depois-marcelo.txt
node /root/gp-aro/conf/conf.js p,l3,m6,f 2 > depois-conf-p.txt 2>&1
cat depois-conf-p.txt
grep -a "TRAVA POS-ORCAMENTO" /tmp/lab-bot.log
