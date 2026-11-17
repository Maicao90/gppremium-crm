cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
q "\d \"FluxoResposta\"" | head -12
echo "== linhas"
q "select chave, left(partes::text, 160), to_char(\"atualizadoEm\",'DD/MM HH24:MI') from \"FluxoResposta\" order by chave"
echo "== textos padrao do catalogo"
for c in servico_oficina alinhamento balanceamento balanceamento_quantidade remold; do grep -n "chave: '$c'" -A9 src/data/fluxoCatalogo.ts | grep -m1 "partes:"; done
