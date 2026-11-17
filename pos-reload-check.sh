LOG=/root/whatsapp-crm/logs/app.log
ERR=/root/whatsapp-crm/logs/error.log
sleep 20
echo "== apos o reload (ultimos 3 min) =="
grep -a "$(date -u '+%Y-%m-%d %H')" $ERR | grep -aiE "device_removed|conflict|401|logged ?out|sem sess" | tail -10
grep -a "$(date -u '+%Y-%m-%d %H')" $LOG | grep -aiE "device_removed|desconect|logged ?out" | tail -10
echo "conexoes abertas desde 15:00:"
awk '/15:00:5|15:0[1-9]/' $LOG | grep -ac "Conexão aberta com sucesso"
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,Math.round(p.monit.memory/1e6)+"MB","restarts",p.pm2_env.restart_time)})'
