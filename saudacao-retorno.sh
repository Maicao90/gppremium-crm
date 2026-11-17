cp /root/whatsapp-crm/backend/data/cerebro/licoes.json /root/licoes-antes-revisao-$(date +%s).json
node /root/aprovar-revisao.js
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "insert into \"FluxoResposta\" (chave, partes, \"atualizadoEm\", \"atualizadoPor\") values ('loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:saudacao_retorno', '[\"Oi, tudo bem? 😊 Vamos seguir com o seu orçamento?\"]', now(), 'Revisão aprovada pelo dono 23/10') on conflict (chave) do update set partes=excluded.partes, \"atualizadoEm\"=now(), \"atualizadoPor\"=excluded.\"atualizadoPor\";"
echo "saudacao_retorno atualizada"
