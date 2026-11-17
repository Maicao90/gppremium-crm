cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'loja(celular)') else 'CLIENTE' end, tipo, left(replace(coalesce(texto,''),E'\n',' '),220) from \"Mensagem\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"chatJid\"='198466395455670@lid' order by timestamp asc"
echo "== estado do fluxo"
q "select \"estadoPreco\", left(\"dadosPreco\",300), \"motivoPausa\", \"pausadoAte\" from \"BotConversa\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"chatJid\"='198466395455670@lid'"
grep -a "198466395455670" /root/whatsapp-crm/logs/app.log | grep -a "17:0[01]\|Fluxo\|assunto\|chaves" | tail -12
