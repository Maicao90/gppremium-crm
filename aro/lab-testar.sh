cd /root/ant-lab
echo "arquivos checados pelo tsc (medidaJuntada + server):"
./node_modules/.bin/tsc --noEmit -p . --listFiles 2>/dev/null | grep -c -e medidaJuntada -e bot-service/server
bash /root/lab-start.sh
node /root/gp-aro/teste-aro.js "$1"
echo
echo "== log do lab"
grep -e juntada -e Erro /tmp/lab-bot.log
