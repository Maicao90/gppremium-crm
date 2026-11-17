bash /root/gp-aro/rodada2.sh || exit 1
echo "=== (c3) mais 3 vezes (a leitura da IA varia)"
for k in 1 2 3; do node /root/gp-aro/teste-aro.js custa; done
echo "== leituras ajustadas no log"
grep "leitura" /tmp/lab-bot.log
