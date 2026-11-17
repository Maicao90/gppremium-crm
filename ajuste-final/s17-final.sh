D=/root/gp-aro/ajuste-final
L=/root/ant-lab/src
cp $D/novo/server.ts $L/bot-service/server.ts
cp $D/novo/travaPosOrcamento.ts $L/data/travaPosOrcamento.ts
cd /root/ant-lab
./node_modules/.bin/tsc --noEmit -p . > $D/tsc-depois.txt 2>&1; echo "tsc exit=$?" > $D/final-status.txt; cat $D/tsc-depois.txt >> $D/final-status.txt
cd $D
/root/ant-lab/node_modules/.bin/ts-node --transpile-only --project /root/ant-lab/tsconfig.json teste-unit.ts > unit.txt 2>&1; echo "unit exit=$?" >> final-status.txt
bash /root/lab-start.sh >> final-status.txt 2>&1
: > /tmp/lab-bot-final-marca
LAB_PORT=3011 node teste-marcelo.js 2 > final-marcelo.txt 2>&1
LAB_PORT=3011 node teste-marcelo.js 2 >> final-marcelo.txt 2>&1
LAB_PORT=3011 node teste-troca-aro.js "" 2 > final-troca.txt 2>&1
node /root/gp-aro/teste-aro.js > final-aro-1.txt 2>&1
node /root/gp-aro/teste-aro.js > final-aro-2.txt 2>&1
node /root/gp-aro/conf/conf.js "" 2 > final-conf.txt 2>&1
grep -a "TRAVA POS-ORCAMENTO" /tmp/lab-bot.log > final-log.txt
echo FIM >> final-status.txt
