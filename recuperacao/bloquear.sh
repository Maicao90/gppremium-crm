q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== contatos =="
q "select distinct \"chatJid\", \"numeroReal\", \"chatNome\" from \"Mensagem\" where \"usuarioId\"='$J' and (\"chatNome\" ilike '%vander%bali%' or \"chatNome\" ilike 'helio%' or \"chatNome\" ilike 'hélio%') and timestamp > now() - interval '30 days';"
echo "== agendamentos pendentes deles =="
q "select a.id, a.numero, a.cliente, a.observacoes, to_char(a.\"enviarEm\" - interval '3 hours','DD/MM HH24:MI') from \"Agendamento\" a where a.status='pendente' and (a.cliente ilike '%vander%' or a.cliente ilike 'helio%' or a.cliente ilike 'hélio%');"
echo "== recuperacao: conversas que a loja ENCERROU (ultima msg da loja fala em encerrar atendimento) =="
q "with ult as (select distinct on (\"chatJid\") \"chatJid\", \"numeroReal\", texto from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and coalesce(\"enviadoPorId\",'')<>'bot' and texto <> '' order by \"chatJid\", timestamp desc)
select count(*) from ult u join \"Agendamento\" a on a.numero = regexp_replace(u.\"numeroReal\",'\D','','g') where a.observacoes like 'robo-recuperacao 22/10%' and a.status='pendente' and u.texto ~* 'encerr';"
