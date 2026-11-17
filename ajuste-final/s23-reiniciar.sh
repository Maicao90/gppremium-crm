pkill -f "gp-aro/ajuste-final/s21-final2.sh"
pkill -f "node teste-marcelo.js"; pkill -f "node /root/gp-aro/teste-aro.js"; pkill -f "node /root/gp-aro/conf/conf.js"
sleep 1
rm -f /root/gp-aro/ajuste-final/final2-*.txt
bash /root/gp-aro/ajuste-final/s22-lancar.sh
