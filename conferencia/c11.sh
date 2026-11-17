cd /root/gp-aro
diff -u /root/ant-lab-bkp-conferente-2210/server.ts /root/ant-lab/src/bot-service/server.ts > conf/conferente-server.diff
diff -u /root/ant-lab-bkp-conferente-2210/medidaJuntada.ts /root/ant-lab/src/data/medidaJuntada.ts > conf/conferente-medidaJuntada.diff
diff -u /root/whatsapp-crm/backend/src/bot-service/server.ts /root/ant-lab/src/bot-service/server.ts > conf/final-server-vs-prod.diff
diff -u /root/whatsapp-crm/backend/src/data/tabelaPrecos.ts /root/ant-lab/src/data/tabelaPrecos.ts > conf/final-tabela-vs-prod.diff
wc -l conf/*.diff
diff -rq /root/whatsapp-crm/backend/src /root/ant-lab/src
echo "== prod git status (src)"
cd /root/whatsapp-crm/backend && git status --short src/ | head
echo "== prod igual ao backup original do outro agente?"
cmp /root/ant-lab-bkp-aro-2210/server.ts /root/whatsapp-crm/backend/src/bot-service/server.ts && echo "server prod = original"
cmp /root/ant-lab-bkp-aro-2210/tabelaPrecos.ts /root/whatsapp-crm/backend/src/data/tabelaPrecos.ts && echo "tabela prod = original"
echo "== conferente diff server"
cat /root/gp-aro/conf/conferente-server.diff
