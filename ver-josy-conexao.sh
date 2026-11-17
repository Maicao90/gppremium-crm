date -u +%H:%M
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== logs da sessao da Josy (ultimos) =="
grep -a "$J" /root/whatsapp-crm/logs/app.log | grep -aiE "conex|desconect|escudo|seguran|close|logged|removed|QR|aberta" | tail -12 | cut -c1-220
echo "== erros =="
grep -a "$J" /root/whatsapp-crm/logs/error.log | tail -8 | cut -c1-220
grep -rn "Sistema de segurança\|sistema de seguranca\|segurança ativad" /root/whatsapp-crm/extension/*.js /root/whatsapp-crm/extension/**/*.js 2>/dev/null | head -5
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,new Date(p.pm2_env.pm_uptime).toISOString(),"restarts",p.pm2_env.restart_time)})'
