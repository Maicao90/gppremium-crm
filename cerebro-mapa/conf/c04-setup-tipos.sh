set -u
C=/root/cerebro-conf
B=/root/whatsapp-crm/backend
rm -rf $C/src $C/data; mkdir -p $C/data
cp -a $B/src $C/src
cp $B/tsconfig.json $C/
ln -sfn $B/node_modules $C/node_modules
cp -a $B/data/cerebro $C/data/cerebro
cp $B/data/bot-lojas.json $C/data/ 2>/dev/null
# licao antiga sem ligadoA (compatibilidade)
printf '[{"id":"Lconfantiga","situacao":"perguntar se a loja entrega em casa","acao":"responder","resposta":"Nao entregamos","lojas":[],"ativo":true,"origem":"dono","criadoEm":"2026-10-22T10:00:00.000Z","atualizadoEm":"2026-10-22T10:00:00.000Z","usos":3}]' > $C/data/cerebro/licoes.json
cp /tmp/conf-server.ts $C/src/conf-server.ts
cp /tmp/conf-testes.js $C/conf-testes.js
cd $C
cat > tsconfig.conf.json <<'EOF'
{ "extends": "./tsconfig.json", "include": [], "files": ["src/bot-service/server.ts", "src/conf-server.ts"] }
EOF
echo "== tsc com cerebro ORIGINAL"; node_modules/.bin/tsc --noEmit -p tsconfig.conf.json 2>&1 | tail -5; echo "exit=$?"
cp /root/cerebro-lab-api/cerebro.ts $C/src/bot-service/cerebro.ts
echo "== tsc com cerebro NOVO"; node_modules/.bin/tsc --noEmit -p tsconfig.conf.json 2>&1 | tail -15; echo "fim tsc"
echo "== passo 2 do publicar (ts-node importando cerebro) - tempo e se sai sozinho"
printf "import './bot-service/cerebro';\nconsole.log('cerebro.ts ok');\n" > src/checar-cerebro.tmp.ts
S=$(date +%s); timeout 180 node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/checar-cerebro.tmp.ts; echo "exit=$? em $(( $(date +%s)-S ))s"
rm -f src/checar-cerebro.tmp.ts
echo "== porta 3011"; ps -o pid,lstart,cmd -p $(ss -ltnp | grep ':3011 ' | grep -o 'pid=[0-9]*' | cut -d= -f2) 2>/dev/null
echo "== vite build do lab"; cd /root/cerebro-lab-painel && timeout 300 npx vite build 2>&1 | tail -12
