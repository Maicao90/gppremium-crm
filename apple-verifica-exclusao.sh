cd /root/whatsapp-crm/backend
echo "== rota de exclusao do CLIENTE =="
grep -rn "excluir-conta" src/routes/*.ts | head
F=$(grep -rln "cliente/excluir-conta" src/routes | head -1)
L=$(grep -n "cliente/excluir-conta" $F | head -1 | cut -d: -f1)
sed -n "${L},$((L+45))p" $F
echo "== chamadas de exclusao no nginx (todas) =="
zgrep -h "excluir-conta" /var/log/nginx/access.log* 2>/dev/null | awk '{print $1, $4, $6, $7, $9}' | tail -15
echo "== conta demo do cliente =="
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select nome, (senha<>'') tem_senha, email<>'' tem_email from \"GarantiaCliente\" where cpf='52998224725';"
echo "== conta do video (CPF do Maicon) depois de excluir =="
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select nome, (senha<>'') tem_senha, (email<>'') tem_email, (\"pushToken\"<>'') tem_push from \"GarantiaCliente\" where cpf='05988430198';"
