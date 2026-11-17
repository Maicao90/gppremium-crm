cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== conversas em pausa infinita (>30 dias) e o ultimo emoji do robo nelas"
q "select b.\"usuarioId\", b.\"chatJid\", b.\"motivoPausa\", to_char(b.\"pausadoAte\",'YYYY-MM-DD'), to_char(b.\"atualizadoEm\" - interval '3 hours','DD/MM HH24:MI'),
  (select to_char(max(m.timestamp) - interval '3 hours','DD/MM HH24:MI') from \"Mensagem\" m where m.\"usuarioId\"=b.\"usuarioId\" and m.\"chatJid\"=b.\"chatJid\" and m.\"fromMe\" and m.\"enviadoPorId\"='bot' and m.texto='🙋🏼‍♀️')
  from \"BotConversa\" b where b.\"pausadoAte\" > now() + interval '30 days' order by b.\"atualizadoEm\" desc" 2>/dev/null || q "select \"usuarioId\", \"chatJid\", \"motivoPausa\", \"pausadoAte\" from \"BotConversa\" where \"pausadoAte\" > now() + interval '30 days'"
echo "== emojis de remarketing do robo hoje (ultimos 15) e a pausa atual da conversa"
q "select to_char(m.timestamp - interval '3 hours','HH24:MI'), m.\"chatJid\", coalesce(b.\"motivoPausa\",'-'), coalesce(to_char(b.\"pausadoAte\",'YYYY-MM-DD HH24:MI'),'-') from \"Mensagem\" m left join \"BotConversa\" b on b.\"usuarioId\"=m.\"usuarioId\" and b.\"chatJid\"=m.\"chatJid\" where m.\"fromMe\" and m.\"enviadoPorId\"='bot' and m.texto='🙋🏼‍♀️' and m.timestamp > now() - interval '12 hours' order by m.timestamp desc limit 15"
echo "== codigo do remarketing (filtros)"
n=$(grep -n "function iniciarRemarketingRobo" src/workers/whatsappService.ts | cut -d: -f1); sed -n "$n,$((n+75))p" src/workers/whatsappService.ts | grep -n "pausad\|naoAtender\|continue\|motivo" | head -30
