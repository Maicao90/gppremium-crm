echo "== o que o revisor (IP 17.x) fez hoje =="
grep -h '^17\.' /var/log/nginx/access.log | grep -E 'login|excluir|garantia-app' | awk '{print $4, $7, $9}' | tail -20
echo "== tabelas de cliente da garantia =="
cd /root/whatsapp-crm/backend
grep -nE '^model .*(Cliente|Garantia)' prisma/schema.prisma | head
