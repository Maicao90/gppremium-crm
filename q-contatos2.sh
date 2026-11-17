cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== contatos com nome real x so numero, por usuario"
q "select c.\"usuarioId\", u.nome, count(*) filter (where c.nome <> c.numero and c.nome <> ''), count(*) from \"Contato\" c join \"Usuario\" u on u.id=c.\"usuarioId\" group by 1,2 order by 4 desc limit 15"
echo "== josy: nomes reais recentes"
q "select nome, numero, to_char(\"atualizadoEm\",'DD/MM HH24:MI') from \"Contato\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and nome <> numero order by \"atualizadoEm\" desc limit 10"
echo "== rota contatos"
sed -n 1,80p src/routes/contatos.ts
grep -rn "contatos" src/server.ts src/app.ts 2>/dev/null | head -5
