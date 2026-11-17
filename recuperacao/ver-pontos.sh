cd /root/whatsapp-crm/backend/src/workers
sed -n 262,274p agendaWorker.ts
grep -n "const textoEco = " whatsappService.ts
grep -n "waIdsBotIA = \|function lembrarWaIdBotIA" whatsappService.ts
grep -n "^import\|require('./whatsappService')" agendaWorker.ts | head
