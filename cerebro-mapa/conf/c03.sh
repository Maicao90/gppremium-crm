set -u
B=/root/whatsapp-crm/backend
echo "== public do painel"; ls -la /root/crm-de-anuncios/public; ls -la $B/public/anuncios/dados | head
echo "== proxy /api/cerebro"; grep -rn "cerebro" $B/src/server.ts $B/src/routes/*.ts 2>/dev/null | head; grep -rn "3010" $B/src --include=*.ts | grep -v bot-service/ | head; grep -rn "cerebro\|3010" /etc/nginx/sites-enabled/ 2>/dev/null | head
grep -n "api/cerebro\|listen(" $B/src/bot-service/server.ts | head
echo "== efeitos de topo em cerebro/llmAnthropic"; grep -n "^setInterval\|^setTimeout\|^[a-zA-Z].*setInterval(\|^const .*= new \|^[a-z][A-Za-z]*(" $B/src/bot-service/cerebro.ts $B/src/services/llmAnthropic.ts | head
grep -n "^import" $B/src/services/llmAnthropic.ts
echo "== diff arvore lab x prod (src)"; diff -rq /root/crm-de-anuncios/src /root/cerebro-lab-painel/src; diff -q /root/crm-de-anuncios/package.json /root/cerebro-lab-painel/package.json; diff -q /root/crm-de-anuncios/vite.config.js /root/cerebro-lab-painel/vite.config.js
echo "== .subir x src do lab"; for f in MapaCerebro.jsx MapaCerebro.css cerebroComum.jsx cerebroConstantes.js; do cmp /root/cerebro-lab-painel/.subir/$f /root/cerebro-lab-painel/src/components/$f && echo "ok $f"; done; cmp /root/cerebro-lab-painel/.subir/CerebroRobo.jsx /root/cerebro-lab-painel/src/pages/CerebroRobo.jsx && echo ok CerebroRobo; cmp /root/cerebro-lab-painel/.subir/cerebro.ts /root/cerebro-lab-api/cerebro.ts && echo ok cerebro.ts
ls /root/cerebro-lab-painel /root/cerebro-lab-painel/src /root/cerebro-lab-api/src
echo "== servidores de lab rodando?"; ss -ltnp | grep -v "127.0.0.53" | head -30
