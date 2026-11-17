cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
echo "== grupos com mensagens desde 07/10"
q "select \"usuarioId\", \"chatJid\", max(\"chatNome\"), count(*), count(*) filter (where tipo='imagem') from \"Mensagem\" where \"chatJid\" like '%@g.us' and timestamp > '2026-10-07' group by 1,2 order by 4 desc limit 30"
