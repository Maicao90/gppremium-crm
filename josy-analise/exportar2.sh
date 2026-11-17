U=34268c16-7bed-400a-bf1e-a3d9e37d8774
D=/root/josy-export
q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
for t in Agendamento Garantia GarantiaCliente GarantiaVeiculo; do echo "== $t: $(q "select string_agg(column_name, ',') from information_schema.columns where table_name='$t';")"; done
docker exec gp-postgres-crm psql -U postgres -d testdb -c "\copy (select * from \"Agendamento\" where \"usuarioId\"='$U') to stdout with csv header" > $D/agendamentos.csv
docker exec gp-postgres-crm psql -U postgres -d testdb -c "\copy (select g.*, c.telefone as cliente_telefone, c.nome as cliente_nome from \"Garantia\" g left join \"GarantiaCliente\" c on c.id = g.\"clienteId\") to stdout with csv header" > $D/garantias.csv 2>&1 || true
wc -l $D/agendamentos.csv $D/garantias.csv
head -c 300 $D/garantias.csv; echo
gzip -c $D/agendamentos.csv > /root/josy-agendamentos.csv.gz
gzip -c $D/garantias.csv > /root/josy-garantias.csv.gz
