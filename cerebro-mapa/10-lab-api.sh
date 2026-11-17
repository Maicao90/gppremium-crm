set -e
L=/root/cerebro-lab-api
cp $L/cerebro.ts $L/src/bot-service/cerebro.ts
# ensinamentos de TESTE so na copia do lab (o licoes.json de producao nao e tocado)
cat > $L/data/cerebro/licoes.json <<'JSON'
[
 {"id":"Llabteste1","situacao":"quando o cliente perguntar se a gente entrega o pneu em casa","acao":"responder","resposta":"A gente não faz entrega, mas a montagem aqui na loja é rapidinha.","lojas":[],"ativo":true,"origem":"dono","criadoEm":"2026-10-22T12:00:00.000Z","atualizadoEm":"2026-10-22T12:00:00.000Z","usos":3},
 {"id":"Llabteste2","situacao":"quando o cliente perguntar se o parcelamento no cartao tem juros em 12x","acao":"orientar","resposta":"Explique que o máximo é 10x.","lojas":[],"ativo":false,"origem":"revisao","criadoEm":"2026-10-22T12:00:00.000Z","atualizadoEm":"2026-10-22T12:00:00.000Z","usos":0},
 {"id":"Llabteste3","situacao":"quando o cliente mandar so o aro","acao":"orientar","resposta":"Pergunte a medida completa.","lojas":[],"ativo":true,"origem":"dono","criadoEm":"2026-10-22T12:00:00.000Z","atualizadoEm":"2026-10-22T12:00:00.000Z","usos":0,"ligadoA":"categoria:pedir_medida"}
]
JSON
cd $L
# mesma checagem de tipos que o pm2 faz ao subir o bot-service (ts-node com --project tsconfig.json, sem transpile-only)
echo "=== typecheck (ts-node, igual ao pm2)"
printf "import './bot-service/cerebro';\nconsole.log('cerebro.ts passou na checagem de tipos');\n" > $L/src/checar.ts
timeout 120 node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/checar.ts
pkill -f "cerebro-lab-api/src/lab-server" || true
nohup node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json $L/src/lab-server.ts > $L/lab-server.log 2>&1 &
for i in $(seq 1 60); do ss -ltn | grep -q '127.0.0.1:3015' && break; sleep 1; done
cat $L/lab-server.log
node $L/testar-mapa.js
