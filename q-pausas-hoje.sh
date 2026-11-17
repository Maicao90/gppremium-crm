cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== cliques no painel hoje (UTC)"
grep -h "bot-pneus/acao" /var/log/nginx/access.log | grep "22/Oct/2026" | awk '{print $4}' | tr '\n' ' '; echo
echo "== conversas pausadas hoje: o que o robo mandou DEPOIS da pausa"
for c in $(q "select \"chatJid\" from \"BotConversa\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"motivoPausa\"='atendimento_manual' and \"atualizadoEm\" > now() - interval '20 hours'"); do
  p=$(q "select to_char(\"atualizadoEm\" - interval '3 hours','HH24:MI:SS'), to_char(\"pausadoAte\" - interval '3 hours','DD/MM HH24:MI') from \"BotConversa\" where \"chatJid\"='$c' and \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774'")
  echo "-- $c  (pausa gravada/ate: $p)"
  q "select to_char(timestamp - interval '3 hours','HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'loja') else 'CLIENTE' end, left(replace(coalesce(texto,''),E'\n',' '),70) from \"Mensagem\" where \"chatJid\"='$c' and \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and timestamp > now() - interval '20 hours' order by timestamp desc limit 6"
done
echo "== logs do robo: respondeu em conversa pausada? (pausa em vigor x mandou)"
grep -a "2026-10-22" /root/whatsapp-crm/logs/app.log | grep -ac "pausa em vigor"
