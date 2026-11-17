cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F '|' -c "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
# conversas em que o robo mandou alguma coisa (fora o emoji) desde 21/10 10:00 BRT
q "select distinct \"chatJid\" from \"Mensagem\" where \"usuarioId\"='$J' and \"enviadoPorId\"='bot' and texto <> '🙋🏼‍♀️' and timestamp > '2026-10-21 13:00:00'" > /tmp/chats-robo.txt
wc -l < /tmp/chats-robo.txt
: > /tmp/conversas-robo.txt
while read c; do
  echo "=================== $c" >> /tmp/conversas-robo.txt
  q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI:SS'), case when \"fromMe\" then (case when \"enviadoPorId\"='bot' then 'ROBO' else 'LOJA' end) else 'CLIENTE' end, tipo, replace(coalesce(texto,''),E'\n',' / ') from \"Mensagem\" where \"usuarioId\"='$J' and \"chatJid\"='$c' and timestamp > '2026-10-20 13:00:00' order by timestamp" >> /tmp/conversas-robo.txt
done < /tmp/chats-robo.txt
wc -c /tmp/conversas-robo.txt
