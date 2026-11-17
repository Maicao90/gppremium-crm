diff --strip-trailing-cr -q /root/whatsapp-crm/backend/src/data/fluxoPrecoExtrator.manual-test.ts /root/ant-lab/src/data/fluxoPrecoExtrator.manual-test.ts && echo "manual-test: so CRLF"
cd /root/ant-lab
sed -n 300,640p src/bot-service/server.ts | cat -n | sed 's/^/L+299 /' | head -400
