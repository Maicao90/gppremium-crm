cd /root/ant-lab
echo "== git status lab"; git status --short | head -30; git log --oneline -3
echo "== prod"; cd /root/whatsapp-crm/backend; git log --oneline -3; git status --short | head
echo "== diff lab vs prod relevant files"
for f in src/bot-service/server.ts src/data/fluxoPreco.ts src/data/fluxoPrecoExtrator.ts src/data/tabelaPrecos.ts; do cmp -s /root/ant-lab/$f /root/whatsapp-crm/backend/$f && echo "SAME $f" || echo "DIFF $f"; done
wc -l /root/ant-lab/src/bot-service/server.ts /root/ant-lab/src/data/fluxoPreco.ts /root/ant-lab/src/data/fluxoPrecoExtrator.ts
ls -la /root/whatsapp-crm/backend/*.log 2>/dev/null
ls -la /root/.pm2/logs/ 2>/dev/null | head -30
pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.status,p.pm2_env.pm_out_log_path,p.pm2_env.pm_err_log_path)})'
