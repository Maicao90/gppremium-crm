ls -la /root/gp-aro/
echo ---
ls /root/ant-lab/src/data/ | head -50
echo ---
cat /root/lab-start.sh
echo ---
ss -ltnp | grep -E '3010|3011'
echo --- DIFF server
diff /root/whatsapp-crm/backend/src/bot-service/server.ts /root/ant-lab/src/bot-service/server.ts
echo --- DIFF tabela
diff /root/whatsapp-crm/backend/src/data/tabelaPrecos.ts /root/ant-lab/src/data/tabelaPrecos.ts
echo --- exists in prod?
ls -la /root/whatsapp-crm/backend/src/data/medidaJuntada.ts
echo --- full diff of src trees
diff -rq /root/whatsapp-crm/backend/src /root/ant-lab/src
