cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
C=19177364578465@lid
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'loja(celular)') else 'CLIENTE' end, tipo, left(replace(coalesce(texto,''),E'\n',' '),200) from \"Mensagem\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"chatJid\"='$C' order by timestamp asc"
echo "== logs (app + error) desta conversa"
grep -ah "$C" /root/whatsapp-crm/logs/app.log /root/whatsapp-crm/logs/error.log | grep -a "2026-10-22" | tail -25
echo "== nginx das 13:50-14:05 UTC (corpo nao aparece; so horario)"
grep -h "bot-pneus" /var/log/nginx/access.log | grep "22/Oct/2026:13:5\|22/Oct/2026:14:0" | awk '{print $4, $7, $9}'
