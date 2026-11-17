for i in $(seq 1 115); do grep -q FIM /root/gp-aro/ajuste-final/final2-status.txt && break; sleep 5; done
tail -1 /root/gp-aro/ajuste-final/final2-status.txt
