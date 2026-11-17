cd /root/whatsapp-crm/backend
sed -n 114,200p prisma/schema.prisma
grep -rln "gerar-resposta" src | head
