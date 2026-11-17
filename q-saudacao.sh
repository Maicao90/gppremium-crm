cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== saudacao 'Seja bem-vindo' da Josy nos ultimos 3 dias: quantas e segundos depois da msg do cliente"
q "select count(*), round(avg(extract(epoch from (m.timestamp - c.ts)))), min(extract(epoch from (m.timestamp - c.ts)))::int, max(extract(epoch from (m.timestamp - c.ts)))::int from \"Mensagem\" m cross join lateral (select max(timestamp) ts from \"Mensagem\" x where x.\"usuarioId\"=m.\"usuarioId\" and x.\"chatJid\"=m.\"chatJid\" and not x.\"fromMe\" and x.timestamp <= m.timestamp) c where m.\"usuarioId\"='$J' and m.\"fromMe\" and m.texto like '%Seja bem-vindo(a)%' and m.timestamp > now() - interval '3 days'"
echo "== mensagens humanas (fromMe, nao bot) da Josy em 3 dias, agrupadas pelo inicio do texto"
q "select left(replace(texto,E'\n',' '),60), count(*) from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and coalesce(\"enviadoPorId\",'')<>'bot' and timestamp > now() - interval '3 days' and tipo='texto' group by 1 order by 2 desc limit 8"
echo "== quantas conversas da Josy hoje tiveram mensagem humana / so robo"
q "select count(distinct \"chatJid\") filter (where coalesce(\"enviadoPorId\",'')<>'bot'), count(distinct \"chatJid\") filter (where \"enviadoPorId\"='bot') from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and timestamp > now() - interval '12 hours' and texto not like '%Seja bem-vindo(a)%'"
grep -rn "Seja bem-vindo" /root/whatsapp-crm/backend/src --include=*.ts | head -3
