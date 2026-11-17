docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select timestamp, \"midiaUrl\", left(\"chatJid\",16) from \"Mensagem\" where tipo='audio' and \"enviadoPorId\"='bot' and timestamp > now() - interval '3 hours' order by timestamp desc;"
grep -a 'Bot IA' /root/whatsapp-crm/logs/app.log /root/whatsapp-crm/logs/error.log | grep -aiE 'audio|pausad' | tail -6
