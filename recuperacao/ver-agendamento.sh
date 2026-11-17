cd /root/whatsapp-crm/backend
q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
echo "== amostra de agendamentos da Josy =="
q "select to_char(\"enviarEm\" - interval '3 hours','DD/MM HH24:MI'), status, tipo, \"cancelarSeResponder\", numero, left(replace(mensagem,E'\n',' '),70), cliente from \"Agendamento\" where \"criadoPorId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' order by \"criadoEm\" desc limit 8;"
echo "== status =="
q "select status, count(*) from \"Agendamento\" group by 1;"
echo "== quem envia =="
grep -rln "agendamento.findMany\|prisma.agendamento" src | head
grep -rn "cancelarSeResponder" src --include=*.ts | grep -v routes | head -5
