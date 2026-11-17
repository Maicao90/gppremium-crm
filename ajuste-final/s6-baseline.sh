D=/root/gp-aro/ajuste-final
mkdir -p $D
cd $D
bash /root/lab-start.sh
node teste-troca-aro.js "" 2 > antes-troca.txt 2>&1
node /root/gp-aro/teste-aro.js > antes-aro-1.txt 2>&1
node /root/gp-aro/teste-aro.js > antes-aro-2.txt 2>&1
node /root/gp-aro/conf/conf.js "" 2 > antes-conf.txt 2>&1
cat antes-troca.txt
