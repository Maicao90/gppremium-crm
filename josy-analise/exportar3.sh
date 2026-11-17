docker exec gp-postgres-crm psql -U postgres -d testdb -c "\copy (select * from \"Agendamento\" where \"criadoPorId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774') to stdout with csv header" > /root/josy-export/agendamentos.csv
wc -l /root/josy-export/agendamentos.csv
gzip -c /root/josy-export/agendamentos.csv > /root/josy-agendamentos.csv.gz
