cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
IDS="'f6d02332-a2ce-45d7-8af2-0297f855ef64','0533e6e3-53f1-4282-b2c2-67bfe7867b0f','366b379c-51a3-4d2b-ac6b-f35e38e91272','49d44c1c-8333-4624-833c-9a581f04f1cd','c413f46a-b467-4bec-950c-e2b03ddb34f0','750cdab9-1edd-43b9-9543-18b2f8b7c229','34268c16-7bed-400a-bf1e-a3d9e37d8774','60e58df4-8f3a-4493-94a6-11953546e826'"
echo "nome | REGRA NOVA (criado ate 21/10, saida a partir de 01/10) | enviados (saida 01-21/10) | programados (pendentes) | pendentes com saida antes de 01/10 | falhou"
q "select u.nome,
 count(*) filter (where a.status in ('enviado','pendente') and (a.\"criadoEm\" - interval '3 hours')::date <= '2026-10-21' and (a.\"enviarEm\" - interval '3 hours')::date >= '2026-10-01'),
 count(*) filter (where a.status='enviado' and (a.\"enviarEm\" - interval '3 hours')::date between '2026-10-01' and '2026-10-21'),
 count(*) filter (where a.status='pendente'),
 count(*) filter (where a.status='pendente' and (a.\"enviarEm\" - interval '3 hours')::date < '2026-10-01'),
 count(*) filter (where a.status='falhou')
 from \"Agendamento\" a join \"Usuario\" u on u.id=a.\"criadoPorId\"
 where a.\"criadoPorId\" in ($IDS) and coalesce(a.observacoes,'') not like '%robo-%'
 group by 1 order by 2 desc"
echo "== agendamentos do robo (robo-) por dono, so pra conferir que ficaram fora"
q "select u.nome, count(*) from \"Agendamento\" a join \"Usuario\" u on u.id=a.\"criadoPorId\" where coalesce(a.observacoes,'') like '%robo-%' group by 1"
