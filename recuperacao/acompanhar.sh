q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
date -u '+agora %H:%M UTC'
echo "== status da recuperacao =="
q "select status, count(*) from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%' group by 1 order by 1;"
echo "== enviados hoje =="
q "select to_char(\"atualizadoEm\" - interval '3 hours','HH24:MI'), numero, status from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%' and status in ('enviado','falhou','cancelado') and \"atualizadoEm\" > now() - interval '12 hours' order by \"atualizadoEm\";"
echo "== quem respondeu depois da retomada =="
q "select a.numero, to_char(min(m.timestamp) - interval '3 hours','HH24:MI'), left(string_agg(m.texto, ' / ' order by m.timestamp),120) from \"Agendamento\" a join \"Mensagem\" m on m.\"numeroReal\" = a.numero and not m.\"fromMe\" and m.timestamp > a.\"atualizadoEm\" where a.observacoes like 'robo-recuperacao 22/10%' and a.status='enviado' group by a.numero;"
grep -a "eco de agendamento do robo" /root/whatsapp-crm/logs/app.log | tail -3
grep -a "retomada:" /root/whatsapp-crm/logs/bot-service.log | tail -3
