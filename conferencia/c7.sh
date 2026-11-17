sed -n 790,840p /root/whatsapp-crm/backend/src/workers/botAtendimentoService.ts
echo ======
cd /root/whatsapp-crm/backend
DBURL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | sed 's/?schema=.*//')
which psql >/dev/null && echo "psql ok"
psql "$DBURL" -At -c "\d mensagem" 2>&1 | head -5
psql "$DBURL" -At -c "select table_name from information_schema.tables where table_schema='public' and table_name ilike '%mensag%'" 2>&1
