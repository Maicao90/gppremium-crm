L=/root/whatsapp-crm/logs/bot-service.log
tail -c 12000 $L
echo; echo "== app.log grep 195/55 / aro 16"
grep -n "195/55\|Aro 16\|Pegeuot\|aro 16" /root/whatsapp-crm/logs/app.log | tail -30
ls -la /root/whatsapp-crm/logs/
