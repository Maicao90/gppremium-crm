cd /root/whatsapp-crm
docker exec gp-postgres-crm psql -U postgres -d testdb -c "select column_name from information_schema.columns where table_name='Mensagem';" | tr -d ' ' | grep -v '^$' | tr '\n' ' '
echo
COL=$(docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select column_name from information_schema.columns where table_name='Mensagem' and column_name in ('createdAt','criadoEm','timestamp','dataHora') limit 1;")
echo "coluna data: $COL"
docker exec gp-postgres-crm psql -U postgres -d testdb -c "select \"$COL\", \"enviadoPorId\"='bot' as robo, \"midiaUrl\", left(\"chatJid\",16) as chat from \"Mensagem\" where tipo='audio' and \"fromMe\"=true order by \"$COL\" desc limit 15;"
grep -ahE "Bot IA.*(udio|midia|Midia)" logs/*.log | tail -15
