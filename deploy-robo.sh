set -e
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ts=$(date +%s)
ARQS="src/bot-service/server.ts src/data/fluxoPreco.ts src/data/fluxoPrecoExtrator.ts src/data/fluxoCatalogo.ts src/services/llmAnthropic.ts src/services/botLojas.ts src/workers/botAtendimentoService.ts src/workers/whatsappService.ts"
cd $B && tar -cf /root/backup-robo-$ts.tar $(for a in $ARQS; do [ -f $a ] && echo $a; done) data/bot-pneus-config.json
echo "backup: /root/backup-robo-$ts.tar"
cd /root/ant-lab && cp --parents $ARQS $B/
# foto da fachada da GP + dados da loja GP
cp /root/gp-fachada.jpg $B/data/gp-fachada.jpg
if [ ! -f $B/data/bot-lojas.json ]; then cp /root/bot-lojas.json $B/data/bot-lojas.json; fi
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
linhas=$(wc -l < $LOG)
PORT=3001 pm2 reload whatsapp-crm --update-env >/dev/null
echo "reload whatsapp-crm $(date -u +%H:%M:%S)"
for i in $(seq 1 12); do
  sleep 5
  abertas=$(tail -n +$linhas $LOG | grep -ac "Conexão aberta com sucesso" || true)
  semsessao=$(tail -n +$linhas $LOG | grep -aci "sem sessao registrada\|sem sessão registrada" || true)
  echo "tentativa $i: conexoes abertas=$abertas sem_sessao=$semsessao"
  if [ "$abertas" -ge 10 ]; then break; fi
done
pm2 reload bot-service --update-env >/dev/null && echo "reload bot-service ok"
sleep 3
curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
curl -s -o /dev/null -w "health bot-service: %{http_code}\n" --max-time 10 http://127.0.0.1:3010/health
echo "linha_log_inicio=$linhas"
