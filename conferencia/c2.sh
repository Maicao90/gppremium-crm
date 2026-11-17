diff /root/whatsapp-crm/backend/src/data/fluxoPrecoExtrator.manual-test.ts /root/ant-lab/src/data/fluxoPrecoExtrator.manual-test.ts | head -30
echo ==== medidaJuntada
cat -n /root/ant-lab/src/data/medidaJuntada.ts
echo ==== cmp gp-aro copy
cmp /root/gp-aro/medidaJuntada.ts /root/ant-lab/src/data/medidaJuntada.ts && echo same
cmp /root/gp-aro/server.ts /root/ant-lab/src/bot-service/server.ts && echo same-server
echo ==== tests
cat /root/gp-aro/teste-aro.js
echo ====
cat /root/gp-aro/teste-auditoria-lab.js
echo ====
cat /root/gp-aro/lab-testar.sh /root/gp-aro/rodada2.sh /root/gp-aro/rodada3.sh /root/gp-aro/final.sh /root/gp-aro/lab-aplicar.sh
