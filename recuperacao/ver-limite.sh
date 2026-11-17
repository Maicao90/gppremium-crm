grep -n 'LIMITE_DIARIO_POR_USUARIO\s*=\|function gapAleatorio' -A3 /root/whatsapp-crm/backend/src/workers/agendaWorker.ts | head -12
grep -n 'LIMITE_DIARIO\|AGENDA_' /root/whatsapp-crm/backend/.env | sed 's/=.*/=(definido)/'
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select to_char(\"atualizadoEm\"::date,'DD/MM'), count(*) from \"Agendamento\" where \"criadoPorId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and status='enviado' and \"atualizadoEm\" > now()-interval '8 days' group by 1 order by 1;"
