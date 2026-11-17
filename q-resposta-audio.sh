cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
J=$(q "select \"usuarioId\" || ' ' || \"chatJid\" from \"Mensagem\" where \"midiaUrl\" like '%AC41D0D3630AEF5193284339CA1876B3%' limit 1")
set -- $J
echo "conta=$1 chat=$2"
q "select to_char(timestamp - interval '3 hours','HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'loja') else 'CLIENTE' end, tipo, left(replace(coalesce(texto,''),E'\n',' '),110) from \"Mensagem\" where \"usuarioId\"='$1' and \"chatJid\"='$2' order by timestamp desc limit 10"
grep -a "$2" /root/whatsapp-crm/logs/app.log | grep -a "Bot IA" | tail -6
