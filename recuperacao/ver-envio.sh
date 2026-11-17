cd /root/whatsapp-crm/backend/src
n=$(grep -n 'export async function enviarMensagem(' workers/whatsappService.ts | cut -d: -f1)
echo "enviarMensagem na linha $n"
sed -n "${n},$((n+70))p" workers/whatsappService.ts | grep -n 'lembrar\|pausar\|sendMessage\|enviadoPorId\|waId\|chatsBotEnviando\|BotIA\|agendamento'
echo "== lembrarWaId x eco =="
grep -n 'function lembrarWaId\b\|function lembrarWaId(' -A6 workers/whatsappService.ts | head -12
grep -n 'waIdsEnviadosPeloSistema\|waIdsRecentes\|idsEnviados' workers/whatsappService.ts | head
sed -n 1608,1640p workers/whatsappService.ts
