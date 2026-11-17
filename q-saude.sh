date -u +%H:%M:%S
pm2 jlist | node -e 'const l=JSON.parse(require("fs").readFileSync(0));for(const p of l)console.log(p.name,p.pm2_env.status,"up",new Date(p.pm2_env.pm_uptime).toISOString().slice(11,19),"restarts",p.pm2_env.restart_time,"mem",Math.round((p.monit||{}).memory/1e6)+"MB")'
curl -s -o /dev/null -w "crm %{http_code} %{time_total}s\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
curl -s -o /dev/null -w "painel %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/anuncios/
curl -s -o /dev/null -w "link %{http_code}\n" --max-time 10 https://link.pneusgppremium.com.br/ranking/
L=/root/whatsapp-crm/logs/app.log
echo "conexoes abertas desde o reload: $(tail -n 5000 $L | awk '$2 >= "18:40:50"' | grep -ac 'Conexão aberta com sucesso')"
tail -n 5000 $L | awk '$2 >= "18:40:50"' | grep -a 'device_removed\|loggedOut' | head -3
echo "== erros desde o reload"
tail -n 400 /root/whatsapp-crm/logs/error.log | awk '$2 >= "18:40:50"' | grep -av DisparoWorker | tail -8
uptime; free -m | head -2
