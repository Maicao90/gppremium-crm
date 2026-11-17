cd /root/josy-analise
pkill -f esperar.sh || true
nohup bash esperar.sh > esperar.log 2>&1 < /dev/null &
sleep 3
cat esperar.log
pgrep -fa esperar.sh
