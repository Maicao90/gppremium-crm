date; L=/root/whatsapp-crm/logs/bot-service.log
ls -la $L
grep -n "556198132318\|98132318" $L | tail -40
echo "== app.log"
grep -n "98132318" /root/whatsapp-crm/logs/app.log | tail -40
