cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== conversas com pausa manual mexidas hoje"
q "select \"chatJid\", \"motivoPausa\", to_char(\"pausadoAte\" - interval '3 hours','YYYY-MM-DD HH24:MI'), to_char(\"atualizadoEm\" - interval '3 hours','DD/MM HH24:MI') from \"BotConversa\" where \"atualizadoEm\" > now() - interval '10 hours' and (\"motivoPausa\"='atendimento_manual' or \"pausadoAte\" > now() + interval '1 day') order by \"atualizadoEm\" desc limit 15"
echo "== nginx: chamadas de pausar no painel hoje"
grep -h "bot-pneus" /var/log/nginx/access.log 2>/dev/null | grep -i "POST" | tail -15 | awk '{print $4, $7, $9}'
