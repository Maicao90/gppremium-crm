set -u
rm -rf /root/cerebro-conf
rm -f /tmp/conf-server.ts /tmp/conf-testes.js /tmp/cerebro.conf.ts /tmp/MapaCerebro.conf.jsx /tmp/publicar-mapa-cerebro.conf.sh
ss -ltn | grep -E ':301[5-8] ' || echo "portas de lab 3015-3018 livres"
md5sum /root/whatsapp-crm/backend/src/bot-service/cerebro.ts /root/crm-de-anuncios/src/pages/CerebroRobo.jsx
ls /root/crm-de-anuncios/src/components | grep -i -E "mapa|cerebro" || echo "producao do painel intocada"
pm2 jlist 2>/dev/null > /tmp/c7.json; node -e 'for(const p of require("/tmp/c7.json"))if(["bot-service","whatsapp-crm"].includes(p.name))console.log(p.name,p.pm2_env.status,"restarts",p.pm2_env.restart_time,"desde",new Date(p.pm2_env.pm_uptime).toISOString())'; rm -f /tmp/c7.json
