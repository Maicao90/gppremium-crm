cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
L=72213a6c-31c5-410d-a6b4-504dfd223e2f
q "insert into \"FluxoResposta\" (chave, partes, \"atualizadoPor\", \"atualizadoEm\") values
 ('loja:$L:promocao_leve4', \$\$[\"A promoção *compre 3 e leve 4* funciona assim: você paga 3 pneus e leva 4 — o 4º sai de graça.\",\"Ela vale para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.\"]\$\$, 'Maicon (ajuste 22/10)', now())
 on conflict (chave) do update set partes = excluded.partes, \"atualizadoPor\" = excluded.\"atualizadoPor\", \"atualizadoEm\" = now()"
q "select chave, partes from \"FluxoResposta\" where chave = 'loja:$L:promocao_leve4'"
node /root/ajustes-sem-reload-2210.js
