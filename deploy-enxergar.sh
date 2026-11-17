set -e
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ts=$(date +%s)
ARQS="src/services/leituraImagem.ts src/workers/botAtendimentoService.ts"
cd $B && tar -cf /root/backup-contexto-$ts.tar $(for a in $ARQS; do [ -f $a ] && echo $a; done)
cd /root/ant-lab && cp --parents $ARQS $B/
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
cd /root/whatsapp-crm && git add $(for a in $ARQS; do echo backend/$a; done) && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo enxerga o que a atendente faz: transcreve os audios dela e le as fotos (orcamento) antes de responder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format="%h"
linhas=$(wc -l < $LOG)
PORT=3001 pm2 reload whatsapp-crm --update-env >/dev/null
echo "reload whatsapp-crm $(date -u +%H:%M:%S)"
for i in $(seq 1 12); do
  sleep 5
  abertas=$(tail -n +$linhas $LOG | grep -ac "Conexão aberta com sucesso" || true)
  semsessao=$(tail -n +$linhas $LOG | grep -ac "sem sessão registrada" || true)
  echo "tentativa $i: conexoes abertas=$abertas sem_sessao=$semsessao"
  if [ "$abertas" -ge 10 ]; then break; fi
done
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
