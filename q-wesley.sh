cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
date
q "select distinct m.\"usuarioId\", u.nome, m.\"chatJid\" from \"Mensagem\" m join \"Usuario\" u on u.id=m.\"usuarioId\" where m.\"numeroReal\" like '556185505617%' or m.\"chatJid\" like '556185505617%' or m.\"chatJid\" like '55618550561%'"
set -- $(q "select \"usuarioId\" || ' ' || \"chatJid\" from \"Mensagem\" where \"numeroReal\" like '556185505617%' or \"chatJid\" like '556185505617%' order by timestamp desc limit 1")
echo "conta=$1 chat=$2"
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'loja(celular)') else 'CLIENTE' end, tipo, left(replace(coalesce(texto,''),E'\n',' '),140) from \"Mensagem\" where \"usuarioId\"='$1' and \"chatJid\"='$2' order by timestamp desc limit 30"
echo "== BotConversa"
q "select \"estadoPreco\", left(\"dadosPreco\",200), \"motivoPausa\", \"pausadoAte\", \"ultimaRespostaEm\" from \"BotConversa\" where \"usuarioId\"='$1' and \"chatJid\"='$2'"
echo "== logs"
grep -a "$2" /root/whatsapp-crm/logs/app.log | grep -a "Bot IA\|audio\|Fluxo" | tail -15
echo "== eventos do fluxo"
q "select to_char(\"criadoEm\" - interval '3 hours','HH24:MI:SS'), via, left(coalesce(chaves::text,''),120), left(coalesce(assuntos::text,''),160) from \"FluxoEvento\" where \"usuarioId\"='$1' and \"chatJid\"='$2' order by \"criadoEm\" desc limit 8" 2>&1 | head -12
