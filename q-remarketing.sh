cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== envios com a mulher levantando a mao pela GP (30 dias): total / manuais / robo"
q "select count(*), count(*) filter (where \"enviadoPorId\" is null), count(*) filter (where \"enviadoPorId\"='bot') from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and texto like '%🙋%' and timestamp > now()-interval '30 days'"
echo "== agendamentos da Josy com o emoji"
q "select count(*), min(to_char(\"enviarEm\",'DD/MM')), max(to_char(\"enviarEm\",'DD/MM')) from \"Agendamento\" where \"criadoPorId\"='$J' and mensagem like '%🙋%'"
echo "== exemplos: texto, horas depois da ultima msg do cliente, respostas em 2 dias"
q "with e as (select \"chatJid\", timestamp, texto from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and texto like '%🙋%' and timestamp > now()-interval '30 days' order by timestamp desc limit 15)
select to_char(e.timestamp - interval '3 hours','DD/MM HH24:MI'), left(replace(e.texto,E'\n',' '),40),
 round(extract(epoch from (e.timestamp - (select max(m.timestamp) from \"Mensagem\" m where m.\"usuarioId\"='$J' and m.\"chatJid\"=e.\"chatJid\" and not m.\"fromMe\" and m.timestamp < e.timestamp)))/3600,1),
 (select count(*) from \"Mensagem\" m where m.\"usuarioId\"='$J' and m.\"chatJid\"=e.\"chatJid\" and not m.\"fromMe\" and m.timestamp > e.timestamp and m.timestamp < e.timestamp + interval '2 days')
from e"
echo "== taxa de resposta geral do emoji (30 dias)"
q "with e as (select \"chatJid\", timestamp from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and texto like '%🙋%' and timestamp > now()-interval '30 days')
select count(*), count(*) filter (where exists (select 1 from \"Mensagem\" m where m.\"usuarioId\"='$J' and m.\"chatJid\"=e.\"chatJid\" and not m.\"fromMe\" and m.timestamp > e.timestamp and m.timestamp < e.timestamp + interval '2 days')) from e"
