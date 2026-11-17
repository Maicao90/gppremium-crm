cd /root/whatsapp-crm/backend
sed -n 472,486p prisma/schema.prisma
docker exec gp-postgres-crm psql -U postgres -d testdb -c "select id, nome, cpf, (senha is not null) as tem_senha, \"createdAt\" from \"GarantiaCliente\" where regexp_replace(cpf,'\D','','g')='52998224725';" 2>&1 | head
