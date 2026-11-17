cd /root/whatsapp-crm/backend
sed -n 740,930p src/workers/botAtendimentoService.ts
grep -n "async function registrarEventoFluxo" -A40 src/workers/botAtendimentoService.ts | head -60
grep -n "^model \(BotConversa\|FluxoEvento\|EventoFluxo\)" -A25 prisma/schema.prisma
