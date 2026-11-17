L=/root/cerebro-lab-api
cd $L
pkill -f "src/lab-server.ts" || true
sleep 2
nohup node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json $L/src/lab-server.ts > $L/lab-server.log 2>&1 &
for i in $(seq 1 90); do grep -q "ouvindo" $L/lab-server.log && break; sleep 1; done
cat $L/lab-server.log
node $L/testar-mapa.js 2>&1 | grep -v "^   etapa:"
