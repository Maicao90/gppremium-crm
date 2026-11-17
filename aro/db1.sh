cd /root/whatsapp-crm/backend
grep -o '^DATABASE_URL=.*' .env | sed 's/:[^:@]*@/:***@/'
grep -n "^model \(Mensagem\|Message\|Conversa\|Contato\|Chat\)" prisma/schema.prisma
grep -n "fetch('http://127.0.0.1:3010\|gerar-resposta\|ultimosTextosCliente\|estadoPreco" src/services/botAtendimentoService.ts | head -30
