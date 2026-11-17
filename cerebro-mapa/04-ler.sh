cd /root/whatsapp-crm/backend
sed -n 1,420p src/data/fluxoCatalogo.ts
echo "=== app.log amostras de chaves"
tail -c 30000000 /root/whatsapp-crm/logs/app.log | grep -a -i "chaves\|acaoTipo\|\[Fluxo\|via=\|via:" | tail -n 40 | cut -c1-400
echo "=== bot-service-error tail"
tail -n 15 /root/whatsapp-crm/logs/bot-service-error.log | cut -c1-300
