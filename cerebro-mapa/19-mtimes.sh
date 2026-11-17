cd /root/whatsapp-crm/backend
ls -la --time-style=+%H:%M:%S src/bot-service/server.ts src/bot-service/cerebro.ts src/workers/botAtendimentoService.ts src/data/medidaJuntada.ts src/data/comportamentoGuard.ts src/routes/botPneus.ts src/services/transcricaoLocal.ts data/cerebro/licoes.json | awk '{print $6, $7}'
cat data/cerebro/licoes.json | head -c 400; echo
