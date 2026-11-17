cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== chave do CAT_W e textos atuais"
grep -n "CAT_W:" src/data/fluxoPrecoExtrator.ts | head -2
grep -n "'PERGUNTOU_SE_E_NOVO'\|PERGUNTOU_CONDICAO\|case 'PERGUNTOU_SE_NOVO" src/data/fluxoPreco.ts | head -4
for c in condicao promocao_leve4; do grep -n "chave: '$c'" -A9 src/data/fluxoCatalogo.ts | grep "partes:"; done
echo "== numeros reais dos chats internos"
for c in 111561809088624@lid 183369350557846@lid; do q "select '$c', max(split_part(coalesce(\"numeroReal\",''),':',1)), max(\"chatNome\") from \"Mensagem\" where \"chatJid\"='$c'"; done
cat data/bot-nao-atender.json | head -30
grep -n "lerBotPneusConfig" src/services/botPneusConfig.ts | head -3
