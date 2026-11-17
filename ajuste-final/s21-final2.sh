D=/root/gp-aro/ajuste-final
L=/root/ant-lab/src
cp $D/novo/travaPosOrcamento.ts $L/data/travaPosOrcamento.ts
cd /root/ant-lab
./node_modules/.bin/tsc --noEmit -p . > $D/tsc-depois.txt 2>&1; echo "tsc exit=$?" > $D/final2-status.txt; cat $D/tsc-depois.txt >> $D/final2-status.txt
cd $D
/root/ant-lab/node_modules/.bin/ts-node --transpile-only --project /root/ant-lab/tsconfig.json teste-unit.ts > unit.txt 2>&1; echo "unit exit=$?" >> final2-status.txt
bash /root/lab-start.sh >> final2-status.txt 2>&1
LAB_PORT=3011 node teste-marcelo.js 2 > final2-marcelo.txt 2>&1
LAB_PORT=3011 node teste-marcelo.js 2 >> final2-marcelo.txt 2>&1
node /root/gp-aro/teste-aro.js > final2-aro.txt 2>&1
node /root/gp-aro/conf/conf.js "" 1 > final2-conf.txt 2>&1
grep -a "TRAVA POS-ORCAMENTO" /tmp/lab-bot.log > final2-log.txt
echo FIM >> final2-status.txt
