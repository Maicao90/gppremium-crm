set -e
P=/root/cerebro-lab-painel; L=/root/cerebro-lab-api; S=$P/.subir
cp $S/cerebroComum.jsx $S/cerebroConstantes.js $S/MapaCerebro.jsx $S/MapaCerebro.css $P/src/components/
cp $S/CerebroRobo.jsx $P/src/pages/CerebroRobo.jsx
mkdir -p $P/lab && cp $S/lab-main.jsx $P/lab/main.jsx && cp $S/lab.html $S/vite.lab.config.js $P/
cp $S/cerebro.ts $L/cerebro.ts && cp $S/cerebro.ts $L/src/bot-service/cerebro.ts && cp $S/lab-server.ts $L/src/lab-server.ts && cp $S/testar-mapa.js $L/
cd $P
echo "=== eslint (arquivos novos)"
npx eslint src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/components/cerebroConstantes.js || true
echo "=== build do painel (dist do lab)"
npx vite build 2>&1 | grep -E "error|Error|built in|index-" || true
echo "=== build da pagina de teste"
npx vite build --config vite.lab.config.js 2>&1 | grep -E "error|Error|built in|lab" || true
cd $L
echo "=== tipos do cerebro.ts (ts-node igual ao pm2)"
node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/checar.ts
pkill -f "src/lab-server.ts" || true
sleep 2
nohup node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json $L/src/lab-server.ts > $L/lab-server.log 2>&1 &
for i in $(seq 1 90); do grep -q "ouvindo" $L/lab-server.log && break; sleep 1; done
cat $L/lab-server.log
node $L/testar-mapa.js 2>&1 | head -n 12
curl -s -o /dev/null -w "pagina de teste -> %{http_code}\n" http://127.0.0.1:3015/anuncios/
