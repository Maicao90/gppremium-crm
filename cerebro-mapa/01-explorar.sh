set -e
cd /root/whatsapp-crm/backend
wc -l src/bot-service/cerebro.ts src/data/fluxoPreco.ts src/data/fluxoPrecoExtrator.ts
ls src/bot-service/
ls data/cerebro data/cerebro/revisoes | head -30
ls -la /root/crm-de-anuncios/src/pages/CerebroRobo.jsx
ls /root/crm-de-anuncios/src/components | head -50
ls /root | head -60
find / -name "bot-service*.log" -not -path "/proc/*" 2>/dev/null | head
ls ~/.cache/ms-playwright 2>/dev/null || echo sem-playwright-cache
which chromium chromium-browser google-chrome 2>/dev/null || echo sem-chrome
ss -ltnp | grep -E ':30(1|0)[0-9]' || true
