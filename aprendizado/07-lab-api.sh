# Aplica o codigo da API no LAB, checa tipos, sobe o servidor de laboratorio (127.0.0.1:3017) e roda os testes.
set -e
LA=/root/aprendizado-lab-api
IN=/root/aprendizado-lab-api/.entrada
cp $IN/cerebro.ts $LA/src/bot-service/cerebro.ts
cp $IN/server.ts $LA/src/bot-service/server.ts
cp $IN/lab-server.ts $LA/src/lab-server.ts
cp $IN/testar-aprendizado.js $LA/testar-aprendizado.js
cp $IN/aprendizado-josy.json $LA/aprendizado-josy.exemplo.json
# dados de teste: aprendizado de exemplo, licoes vazias (como em producao hoje), sem audio josy-* sobrando
cp $LA/aprendizado-josy.exemplo.json $LA/data/cerebro/aprendizado-josy.json
echo '[]' > $LA/data/cerebro/licoes.json
rm -f $LA/public/midias/bot-audios/josy-*.ogg
cd $LA
echo "=== diff server.ts (producao -> lab)"; diff -u .originais/server.ts src/bot-service/server.ts || true
echo "=== checagem de tipos (tsc, mesmas regras do tsconfig da producao) em server.ts + cerebro.ts + lab-server.ts"
printf '{ "extends": "./tsconfig.json", "include": [], "files": ["src/bot-service/server.ts", "src/lab-server.ts"], "compilerOptions": { "noEmit": true } }\n' > tsconfig.checar.json
if timeout 300 node_modules/.bin/tsc -p tsconfig.checar.json > tsc.log 2>&1; then echo "tsc: sem erros"; else echo "tsc com erros:"; head -40 tsc.log; fi
pkill -f "aprendizado-lab-api/src/lab-server.ts" || true
sleep 1
nohup node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json $LA/src/lab-server.ts > $LA/lab-server.log 2>&1 &
for i in $(seq 1 120); do grep -q "ouvindo" $LA/lab-server.log && break; grep -qi "error" $LA/lab-server.log && break; sleep 1; done
cat $LA/lab-server.log
ss -ltnp | grep 3017 || true
node $LA/testar-aprendizado.js || true
echo "=== estado depois dos testes"
ls -la $LA/public/midias/bot-audios $LA/data/cerebro
cat $LA/data/cerebro/licoes.json
