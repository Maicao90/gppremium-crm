bash /root/gp-aro/lab-aplicar.sh || exit 1
bash /root/gp-aro/lab-testar.sh "$1"
echo "=== REGRESSAO (casos reais 21-22/10 do teste-auditoria, simular:true, porta 3011)"
grep -n "const URL" /root/gp-aro/teste-auditoria-lab.js
node /root/gp-aro/teste-auditoria-lab.js
