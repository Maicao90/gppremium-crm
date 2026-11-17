cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== chats com 4236"
q "select \"usuarioId\", \"chatJid\", max(\"chatNome\"), max(\"numeroReal\"), count(*), to_char(max(timestamp) - interval '3 hours','DD/MM HH24:MI') from \"Mensagem\" where \"chatJid\" like '%4236@%' or \"numeroReal\" like '%4236%' group by 1,2"
echo "== ultimas msgs"
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), \"fromMe\", coalesce(\"enviadoPorId\",'-'), left(texto,70) from \"Mensagem\" where \"chatJid\" like '%4236@%' or \"numeroReal\" like '%4236%' order by timestamp desc limit 8"
echo "== agendamentos pendentes"
q "select id, to_char(\"enviarEm\" - interval '3 hours','DD/MM HH24:MI'), left(mensagem,50), coalesce(observacoes,'') from \"Agendamento\" where status='pendente' and numero like '%4236'"
echo "== naoAtender"
n=$(grep -n "export async function naoAtender" src/workers/botAtendimentoService.ts | cut -d: -f1); sed -n "$n,$((n+25))p" src/workers/botAtendimentoService.ts
grep -n "Remarketing\].*" logs/*.log 2>/dev/null | tail -0
grep -a "4236" /root/whatsapp-crm/logs/app.log | tail -8
