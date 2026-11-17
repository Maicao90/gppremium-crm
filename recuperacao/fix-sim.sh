set -e
B=/root/whatsapp-crm/backend
L=/root/ant-lab
# testa primeiro no LAB (porta 3011)
cp $B/src/bot-service/server.ts $L/src/bot-service/server.ts
cp $B/src/bot-service/cerebro.ts $L/src/bot-service/cerebro.ts
cp $B/src/data/medidaJuntada.ts $B/src/data/tabelaPrecos.ts $L/src/data/
python3 /root/fix-sim.py $L/src/bot-service/server.ts
cd $L && ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | head -5 && echo TSC_LAB_FEITO
