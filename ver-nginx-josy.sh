L=/var/log/nginx/access.log
echo "== codigos de resposta nos ultimos 20 min =="
awk -v d="$(date -u -d '-20 min' '+%d/%b/%Y:%H:%M')" '$4 > "["d' $L | awk '{print $9}' | sort | uniq -c | sort -rn | head
echo "== 429/403/5xx recentes =="
awk -v d="$(date -u -d '-20 min' '+%d/%b/%Y:%H:%M')" '$4 > "["d && ($9==429 || $9==403 || $9>=500)' $L | awk '{print $1, $4, $7, $9}' | tail -15
echo "== IPs que mais chamam (20 min) =="
awk -v d="$(date -u -d '-20 min' '+%d/%b/%Y:%H:%M')" '$4 > "["d' $L | awk '{print $1}' | sort | uniq -c | sort -rn | head -5
grep -rn "segurança\|seguranca" /root/whatsapp-crm/backend/src/server.ts | head -5
