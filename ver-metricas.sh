q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== josy em outubro =="
q "select 'por enviarEm (out)', count(*), count(*) filter (where status='enviado') from \"Agendamento\" where \"criadoPorId\"='$J' and \"enviarEm\" >= '2026-10-01 03:00' and \"enviarEm\" < '2026-11-01 03:00';"
q "select 'por enviarEm sem robo', count(*), count(*) filter (where status='enviado') from \"Agendamento\" where \"criadoPorId\"='$J' and \"enviarEm\" >= '2026-10-01 03:00' and \"enviarEm\" < '2026-11-01 03:00' and coalesce(observacoes,'') not like '%robo-%';"
q "select 'robo por tipo', split_part(observacoes,' ',1), count(*) from \"Agendamento\" where \"criadoPorId\"='$J' and \"enviarEm\" >= '2026-10-01 03:00' and \"enviarEm\" < '2026-11-01 03:00' and observacoes like '%robo-%' group by 2;"
cd /root/crm-de-anuncios/src/pages
grep -n "robo-\|observacoes" AtMetricas.jsx | head
grep -n "Enviados\|ENVIADOS" AtMetricas.jsx | head -5
