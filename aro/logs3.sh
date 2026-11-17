tail -c 6000 /root/whatsapp-crm/logs/bot-service-error.log
echo; echo "== app.log tail grep 98132318 (last 300MB)"
tail -c 300000000 /root/whatsapp-crm/logs/app.log | grep -a "98132318" | tail -60
