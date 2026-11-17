cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
q "select \"usuarioId\", \"chatJid\", max(\"chatNome\"), max(split_part(coalesce(\"numeroReal\",''),':',1)), count(*), to_char(max(timestamp) - interval '3 hours','DD/MM HH24:MI') from \"Mensagem\" where \"chatNome\" ilike '%get%lio%' group by 1,2 order by 6 desc limit 10"
echo "== ultimas msgs do robo pra ele"
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), coalesce(\"enviadoPorId\",'-'), left(texto,60) from \"Mensagem\" where \"chatNome\" ilike '%get%lio%' or \"chatJid\" in (select \"chatJid\" from \"Mensagem\" where \"chatNome\" ilike '%get%lio%') order by timestamp desc limit 6"
echo "== agendamentos pendentes dele"
q "select id, to_char(\"enviarEm\" - interval '3 hours','DD/MM HH24:MI'), left(mensagem,50), coalesce(observacoes,'') from \"Agendamento\" where status='pendente' and cliente ilike '%get%lio%'"
