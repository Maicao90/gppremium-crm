set -u
B=/root/whatsapp-crm/backend
echo "== fluxoCatalogo imports/exports"; ls -la $B/src/data/fluxoCatalogo.ts; grep -n "^import\|^export\|require(" $B/src/data/fluxoCatalogo.ts | head -30
echo "== quem importa fluxoCatalogo"; grep -rln "fluxoCatalogo" $B/src | head
echo "== bot-service server.ts imports"; grep -n "^import\|require('dotenv\|dotenv" $B/src/bot-service/server.ts | head -40
echo "== env DATABASE_URL presente no processo bot-service?"; PID=$(pm2 pid bot-service); tr '\0' '\n' < /proc/$PID/environ | grep -c '^DATABASE_URL=' ; tr '\0' '\n' < /proc/$PID/environ | grep -o '^DATABASE_URL=[a-z]*://[^:]*@\?' | sed 's/:.*//' | head -1
grep -c DATABASE_URL $B/.env 2>/dev/null
echo "== uptime bot-service vs server.ts mtime"; ps -o lstart= -p $PID; stat -c '%y %n' $B/src/bot-service/server.ts $B/src/bot-service/cerebro.ts
cd /root/whatsapp-crm; git status --short backend/src | head; git log -3 --format='%h %ci %s' -- backend/src/bot-service/server.ts
echo "== TZ"; date; cat /etc/timezone 2>/dev/null; timedatectl 2>/dev/null | grep -i zone
echo "== log"; ls -la /root/whatsapp-crm/logs/bot-service.log; grep -m3 "\[Cerebro\] ensinamento" /root/whatsapp-crm/logs/bot-service.log; tail -n 2 /root/whatsapp-crm/logs/bot-service.log | cut -c1-200
pm2 jlist 2>/dev/null > /tmp/conf-pm2.json; node -e 'const a=require("/tmp/conf-pm2.json");for(const p of a){const e=p.pm2_env;if(p.name==="bot-service")console.log("log_date_format",e.log_date_format,"out",e.pm_out_log_path,"err",e.pm_err_log_path,"merge",e.merge_logs, "uptime", new Date(e.pm_uptime).toISOString())}'; rm -f /tmp/conf-pm2.json
echo "== licoes.json"; ls -la $B/data/cerebro/; node -e 'const l=require("/root/whatsapp-crm/backend/data/cerebro/licoes.json");console.log(l.length, l.map(x=>Object.keys(x).join(",")).slice(0,3))'
echo "== painel prod deploy path"; ls -la $B/public/anuncios | head; ls /root/crm-de-anuncios; cat /root/crm-de-anuncios/vite.config.js
