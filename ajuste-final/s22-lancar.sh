setsid nohup bash /root/gp-aro/ajuste-final/s21-final2.sh > /dev/null 2>&1 < /dev/null &
for i in $(seq 1 30); do grep -q "lab 200" /root/gp-aro/ajuste-final/final2-status.txt 2>/dev/null && break; sleep 3; done
cat /root/gp-aro/ajuste-final/final2-status.txt; tail -8 /root/gp-aro/ajuste-final/unit.txt
