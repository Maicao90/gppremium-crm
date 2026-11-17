echo "porta 3015 ouvindo? $(ss -ltn | grep -c ':3015 ')"
pgrep -af "lab-serve[r]" || echo "lab-server parado"
ls /root/cerebro-lab-painel/src/components/ | grep -i cerebro
ls /root/cerebro-lab-api /root/cerebro-lab-painel/.subir
pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,'restarts',p.pm2_env.restart_time,'uptime desde',new Date(p.pm2_env.pm_uptime).toISOString())})"
