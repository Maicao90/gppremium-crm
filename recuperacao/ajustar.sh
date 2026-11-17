q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
# sabado: loja fecha meio-dia -> o que cairia de tarde vai pra manha (14h-17h vira 9h-12h)
q "update \"Agendamento\" set \"enviarEm\" = \"enviarEm\" - interval '5 hours', \"atualizadoEm\" = now() where observacoes like 'robo-recuperacao 22/10%' and status='pendente' and extract(dow from \"enviarEm\" - interval '3 hours') = 6 and extract(hour from \"enviarEm\" - interval '3 hours') >= 14;"
# mesmo numero duas vezes: fica so o primeiro
q "delete from \"Agendamento\" a using \"Agendamento\" b where a.observacoes like 'robo-recuperacao 22/10%' and b.observacoes like 'robo-recuperacao 22/10%' and a.numero = b.numero and a.\"enviarEm\" > b.\"enviarEm\";"
q "select count(*), count(distinct numero) from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%';"
q "select to_char(\"enviarEm\" - interval '3 hours','DD/MM (Dy)'), count(*), to_char(min(\"enviarEm\") - interval '3 hours','HH24:MI'), to_char(max(\"enviarEm\") - interval '3 hours','HH24:MI') from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%' group by 1, date_trunc('day',\"enviarEm\" - interval '3 hours') order by date_trunc('day',\"enviarEm\" - interval '3 hours') limit 3;"
