ls -la /root/gp-aro/ajuste-final/s17-final.sh /root/gp-aro/ajuste-final/novo/travaPosOrcamento.ts
grep -c "C12" /root/gp-aro/ajuste-final/teste-unit.ts
setsid nohup bash /root/gp-aro/ajuste-final/s17-final.sh > /dev/null 2>&1 < /dev/null &
sleep 45
cat /root/gp-aro/ajuste-final/final-status.txt; tail -6 /root/gp-aro/ajuste-final/unit.txt
