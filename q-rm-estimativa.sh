cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
q "with m as (select * from \"Mensagem\" where \"usuarioId\"='$J' and timestamp > now() - interval '4 days' and \"chatJid\" not like '%@g.us' and \"chatJid\" not like '%broadcast%' and \"chatJid\" not like '%newsletter%'),
u as (select distinct on (\"chatJid\") \"chatJid\", \"fromMe\", timestamp from m order by \"chatJid\", timestamp desc),
c as (select \"chatJid\", max(timestamp) t from m where not \"fromMe\" group by 1)
select count(*) filter (where u.\"fromMe\" and u.timestamp < now() - interval '3 hours' and c.t < now() - interval '3 hours' and c.t > now() - interval '3 days'
  and not exists (select 1 from m x where x.\"chatJid\"=u.\"chatJid\" and x.\"fromMe\" and x.timestamp > c.t and x.texto like '%🙋%')) candidatos,
 count(*) total_chats
from u join c using (\"chatJid\")"
