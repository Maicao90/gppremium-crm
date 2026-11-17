cd /root/josy-analise
nohup node sintetizar.mjs > sintese.log 2>&1 < /dev/null &
sleep 20
cat sintese.log
