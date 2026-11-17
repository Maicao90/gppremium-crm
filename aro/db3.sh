cd /root/whatsapp-crm/backend
U=$(grep -o '^DATABASE_URL=.*' .env | sed 's/^DATABASE_URL=//; s/"//g; s/?schema=public//')
psql "$U" -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on;" -c "select timestamp at time zone 'UTC' at time zone 'America/Sao_Paulo' as brt, \"fromMe\", tipo, left(replace(texto, E'\n', ' | '),200) as texto, \"chatJid\", \"numeroReal\" from \"Mensagem\" where (\"chatJid\" like '%98132318%' or \"numeroReal\" like '%98132318%') order by timestamp" 2>&1 | tail -60
echo "== bot state tables?"
psql "$U" -c "\dt" 2>&1 | grep -i "bot\|estado\|fluxo" | head
grep -n "estadoPreco\|dadosPreco\|minutosDesdeUltimaDaLoja\|messages:" src/workers/botAtendimentoService.ts | head -30
