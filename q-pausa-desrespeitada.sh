cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
date -u
echo "== chamadas do painel (pausar/reativar) nas ultimas horas"
grep -h "bot-pneus/acao\|bot-ia" /var/log/nginx/access.log | tail -12 | awk '{print $4, $6, $7, $9}'
echo "== conversas com pausa manual ou longa, mexidas nas ultimas 24h"
q "select b.\"usuarioId\", b.\"chatJid\", b.\"motivoPausa\", to_char(b.\"pausadoAte\" - interval '3 hours','YYYY-MM-DD HH24:MI'), to_char(b.\"atualizadoEm\" - interval '3 hours','DD/MM HH24:MI') from \"BotConversa\" b where b.\"atualizadoEm\" > now() - interval '24 hours' and (b.\"motivoPausa\"='atendimento_manual' or b.\"pausadoAte\" > now() + interval '2 hours') order by b.\"atualizadoEm\" desc limit 12"
echo "== robo respondeu DEPOIS de uma pausa manual ainda valendo? (ultimas 24h)"
q "select m.\"chatJid\", to_char(m.timestamp - interval '3 hours','DD/MM HH24:MI'), left(replace(coalesce(m.texto,''),E'\n',' '),70), b.\"motivoPausa\", to_char(b.\"pausadoAte\" - interval '3 hours','DD/MM HH24:MI'), to_char(b.\"atualizadoEm\" - interval '3 hours','DD/MM HH24:MI') from \"Mensagem\" m join \"BotConversa\" b on b.\"usuarioId\"=m.\"usuarioId\" and b.\"chatJid\"=m.\"chatJid\" where m.\"enviadoPorId\"='bot' and m.timestamp > now() - interval '24 hours' and b.\"motivoPausa\"='atendimento_manual' and b.\"pausadoAte\" > m.timestamp order by m.timestamp desc limit 15"
echo "== usuario/robo ligado por conta"
q "select id, nome, \"botIaAtivo\", \"botIaPausaManualMin\" from \"Usuario\" where \"botIaAtivo\" = true"
