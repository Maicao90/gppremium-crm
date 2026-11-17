cd /root/ant-lab
grep -n "pedir_medida\|aro_sem_medida" src/data/fluxoCatalogo.ts | head -20
for f in src/data/fluxoCatalogo.ts src/services/botPneusConfig.ts src/bot-service/cerebro.ts src/services/llmAnthropic.ts data/bot-pneus-config.json src/workers/botAtendimentoService.ts; do cmp -s /root/ant-lab/$f /root/whatsapp-crm/backend/$f && echo "SAME $f" || echo "DIFF $f"; done
sed -n 220,245p src/data/fluxoPrecoExtrator.ts
grep -n "TABELA_PRECOS_GP: \|medida: '195/55" src/data/tabelaPrecos.ts | head
ls /root/ant-lab/.env 2>/dev/null; ps aux | grep -c "ant-lab/src/bot-service" ; curl -s -m 2 http://127.0.0.1:3011/health; echo
cat /root/teste-auditoria.js | head -3
