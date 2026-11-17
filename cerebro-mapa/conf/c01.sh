set -u
echo "== lab files"; ls -la /root/cerebro-lab-api /root/cerebro-lab-painel/.subir
md5sum /root/cerebro-lab-api/*.ts
echo "== prod cerebro vs original"; md5sum /root/whatsapp-crm/backend/src/bot-service/cerebro.ts /root/cerebro-lab-api/cerebro.original.ts
md5sum /root/crm-de-anuncios/src/pages/CerebroRobo.jsx /root/cerebro-lab-painel/.subir/CerebroRobo.original.jsx
echo "== pg"; ls -d /root/whatsapp-crm/backend/node_modules/pg /root/whatsapp-crm/backend/node_modules/pg-pool 2>&1; grep '"pg"' /root/whatsapp-crm/backend/package.json; grep '"version"' /root/whatsapp-crm/backend/node_modules/pg/package.json
echo "== bot-service dir"; ls -la /root/whatsapp-crm/backend/src/bot-service/
echo "== pm2"; pm2 jlist 2>/dev/null > /tmp/conf-pm2.json; node -e 'const a=require("/tmp/conf-pm2.json");for(const p of a){const e=p.pm2_env;console.log(p.name,e.status,e.pm_exec_path,JSON.stringify(e.args),JSON.stringify(e.node_args),e.pm_cwd,e.restart_time,e.max_memory_restart,JSON.stringify(e.interpreter_args||""))}'; rm -f /tmp/conf-pm2.json
echo "== tsconfig"; cat /root/whatsapp-crm/backend/tsconfig.json
echo "== git wa"; cd /root/whatsapp-crm && git log --oneline -5 && git status --short | head -30
echo "== git painel"; cd /root/crm-de-anuncios && git log --oneline -3 && git status --short | head -30
