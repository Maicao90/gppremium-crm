date -u
echo "=== pm2.log (reinicios de hoje a partir das 14:50)"
grep -a "2026-10-22T1[4-5]:" ~/.pm2/pm2.log | grep -a -v "^\s*$" | grep -a -iE "whatsapp-crm|bot-service|reload|restart|stop|exit|memory|kill|start" | awk '$0 >= "2026-10-22T14:50"' | tail -n 40
echo "=== quem chamou pm2 (historico de shells)"
grep -h -a "pm2 " /root/.bash_history 2>/dev/null | tail -n 10
ps -eo pid,lstart,cmd | grep -a "pm2 \(reload\|restart\)" | grep -v grep || true
echo "=== bot-service.log em volta de 15:26"
grep -a "2026-10-22 15:2[4-8]" /root/whatsapp-crm/logs/bot-service.log | head -n 8
echo "=== mudancas recentes em arquivos de producao (ultimos 60 min)"
find /root/whatsapp-crm/backend/src /root/whatsapp-crm/backend/data -newermt "-60 minutes" -type f 2>/dev/null | head -n 20
