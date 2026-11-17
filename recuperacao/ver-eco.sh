cd /root/whatsapp-crm/backend/src
echo "== agendaWorker: o que faz depois de enviar =="
grep -n "enviarMensagem(" -A12 workers/agendaWorker.ts | grep -n "pausar\|lembrar\|BotIA\|enviadoPorId\|agendamento" | head
echo "== enviarMensagem =="
grep -n "export async function enviarMensagem" -A40 workers/whatsappService.ts | grep -n "lembrarWaId\|pausar\|enviadoPorId\|waIds\|chatsBotEnviando" | head
echo "== o que os agendamentos da josy fizeram com o robo (ultimos envios) =="
grep -a "agendamento\|Agendamento" /root/whatsapp-crm/logs/app.log | grep -ai "paus\|eco" | tail -5
