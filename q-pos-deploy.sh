cd /root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ini=$(grep -an "reload\|Conexão aberta com sucesso" $LOG | tail -12 | head -1 | cut -d: -f1)
echo "== device_removed / 401 / erros desde o reload"
tail -n 3000 $LOG | awk '$2 >= "15:45:40"' | grep -aiE "device_removed|conflict|loggedOut|Erro ao listar|TypeError|PrismaClient" | tail -10
echo "== conexoes abertas desde 15:45"
tail -n 3000 $LOG | awk '$2 >= "15:45:40"' | grep -ac "Conexão aberta com sucesso"
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== pausas longas (>30 dias) ativas"
q "select \"usuarioId\", \"chatJid\", \"motivoPausa\", to_char(\"pausadoAte\",'YYYY-MM-DD') from \"BotConversa\" where \"pausadoAte\" > now() + interval '30 days' order by \"atualizadoEm\" desc nulls last limit 10" 2>/dev/null || q "select \"usuarioId\", \"chatJid\", \"motivoPausa\", to_char(\"pausadoAte\",'YYYY-MM-DD') from \"BotConversa\" where \"pausadoAte\" > now() + interval '30 days' limit 10"
echo "== exemplo de nomes que mudam (josy, ultimos 2 dias)"
q "with n as (select distinct on (m.\"chatJid\") m.\"chatJid\", m.\"chatNome\", split_part(coalesce(m.\"numeroReal\",''),':',1) num from \"Mensagem\" m where m.\"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and m.\"fromMe\"=false and m.\"chatNome\"<>'' and m.timestamp > now() - interval '2 days' order by m.\"chatJid\", m.timestamp desc) select n.\"chatNome\" as perfil, c.nome as agenda from n join \"Contato\" c on c.\"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and c.numero=n.num where c.nome <> n.\"chatNome\" and c.nome ~ '[^0-9 +()-]' limit 12"
