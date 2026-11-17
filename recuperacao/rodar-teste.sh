nohup node /root/teste-respostas.js > /root/teste-respostas.log 2>&1 < /dev/null &
sleep 100
cat /root/teste-respostas.log
