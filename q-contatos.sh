cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== Contato josy"
q "select count(*), max(\"atualizadoEm\") from \"Contato\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774'"
q "select nome, numero, to_char(\"criadoEm\",'DD/MM') from \"Contato\" where \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' order by \"criadoEm\" desc limit 8"
echo "== log contatos-baileys"
grep -a "contatos-baileys" /root/whatsapp-crm/logs/app.log | tail -5
grep -ac "contatos-baileys" /root/whatsapp-crm/logs/app.log
echo "== como o painel monta o nome"
grep -rn "chatNome\|contatosNomes\|contato.findMany" src/routes/*.ts | grep -v "^src/routes/botPneus" | head -30
grep -h '"version"' node_modules/@whiskeysockets/baileys/package.json node_modules/baileys/package.json 2>/dev/null
grep -n "syncFullHistory\|shouldSyncHistoryMessage\|makeWASocket(" src/workers/whatsappService.ts | head
