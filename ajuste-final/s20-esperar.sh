for i in $(seq 1 115); do grep -q FIM /root/gp-aro/ajuste-final/final-status.txt && break; sleep 5; done
tail -2 /root/gp-aro/ajuste-final/final-status.txt
