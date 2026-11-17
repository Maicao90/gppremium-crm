set -e
B=/root/whatsapp-crm/backend
# ---- lab da API (copias; nada aponta pra escrita em producao)
mkdir -p /root/cerebro-lab-api/src/bot-service /root/cerebro-lab-api/src/services /root/cerebro-lab-api/src/data /root/cerebro-lab-api/data
cp $B/src/bot-service/cerebro.ts /root/cerebro-lab-api/
cp $B/src/bot-service/cerebro.ts /root/cerebro-lab-api/cerebro.original.ts
cp $B/src/bot-service/cerebro.ts /root/cerebro-lab-api/src/bot-service/cerebro.ts
cp $B/src/services/llmAnthropic.ts /root/cerebro-lab-api/src/services/
cp $B/src/data/fluxoCatalogo.ts /root/cerebro-lab-api/src/data/
cp -r $B/data/cerebro /root/cerebro-lab-api/data/
cp $B/data/bot-lojas.json /root/cerebro-lab-api/data/
cp $B/tsconfig.json /root/cerebro-lab-api/
[ -e /root/cerebro-lab-api/node_modules ] || ln -s $B/node_modules /root/cerebro-lab-api/node_modules
grep -n "^import" /root/cerebro-lab-api/src/services/llmAnthropic.ts || true
# ---- lab do painel
mkdir -p /root/cerebro-lab-painel
rsync -a --exclude node_modules --exclude dist --exclude .git /root/crm-de-anuncios/ /root/cerebro-lab-painel/
[ -e /root/cerebro-lab-painel/node_modules ] || ln -s /root/crm-de-anuncios/node_modules /root/cerebro-lab-painel/node_modules
ls -la /root/cerebro-lab-api /root/cerebro-lab-painel | head -40
echo "=== api helper"; cat /root/cerebro-lab-painel/src/atendimento/api.js 2>/dev/null | head -40; ls /root/cerebro-lab-painel/src/atendimento
echo "=== css fx"; grep -n "fx-aba\|\.card {\|--panel\|--text\|--muted\|--border" /root/cerebro-lab-painel/src/pages/FluxoAtendimento.css /root/cerebro-lab-painel/src/index.css | head -40
echo "=== ferramentas"; ls /root/crm-de-anuncios/node_modules | grep -i -E "playwright|puppeteer" || echo sem-playwright; npx --no-install playwright --version 2>/dev/null || true
node -v
