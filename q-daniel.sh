cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
D=750cdab9-1edd-43b9-9543-18b2f8b7c229
echo "== Daniel: todos por status"
q "select status, count(*) from \"Agendamento\" where \"criadoPorId\"='$D' group by 1"
echo "== criados 01-21/10 por status (linhas | clientes unicos | cliente+dia unicos)"
q "select status, count(*), count(distinct regexp_replace(coalesce(numero,''),'\D','','g')), count(distinct regexp_replace(coalesce(numero,''),'\D','','g') || to_char(\"criadoEm\" - interval '3 hours','YYYYMMDD')) from \"Agendamento\" where \"criadoPorId\"='$D' and (\"criadoEm\" - interval '3 hours')::date between '2026-10-01' and '2026-10-21' group by 1"
echo "== enviados desde 01/10 (pela data de envio)"
q "select count(*) from \"Agendamento\" where \"criadoPorId\"='$D' and status='enviado' and (\"atualizadoEm\" - interval '3 hours')::date >= '2026-10-01'"
echo "== pendentes: quando foram criados"
q "select to_char(\"criadoEm\" - interval '3 hours','YYYY-MM'), count(*), count(distinct regexp_replace(coalesce(numero,''),'\D','','g')) from \"Agendamento\" where \"criadoPorId\"='$D' and status='pendente' group by 1 order by 1"
echo "== criados por dia no periodo (linhas | cliente unico)"
q "select to_char(\"criadoEm\" - interval '3 hours','DD/MM'), count(*), count(distinct regexp_replace(coalesce(numero,''),'\D','','g')) from \"Agendamento\" where \"criadoPorId\"='$D' and (\"criadoEm\" - interval '3 hours')::date between '2026-10-01' and '2026-10-21' group by 1 order by 1"
echo "== Diogo"
q "select status, count(*) from \"Agendamento\" where \"criadoPorId\"='f6d02332-a2ce-45d7-8af2-0297f855ef64' group by 1"
