D=/root/gp-aro/ajuste-final
cd $D
bash /root/lab-start.sh
node teste-marcelo.js 2 > depois-marcelo.txt 2>&1
node teste-troca-aro.js "" 2 > depois-troca.txt 2>&1
node /root/gp-aro/teste-aro.js > depois-aro-1.txt 2>&1
node /root/gp-aro/teste-aro.js > depois-aro-2.txt 2>&1
node /root/gp-aro/conf/conf.js "" 2 > depois-conf.txt 2>&1
grep -a "TRAVA POS-ORCAMENTO\|troca de aro" /tmp/lab-bot.log > depois-log.txt
echo FIM
