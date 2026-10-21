set -e
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
cp $B/src/workers/botAtendimentoService.ts /root/botAtendimentoService.ts.bak-$(date +%s)
cp /root/ant-lab/src/workers/botAtendimentoService.ts $B/src/workers/botAtendimentoService.ts
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
linhas=$(wc -l < $LOG)
PORT=3001 pm2 reload whatsapp-crm --update-env >/dev/null
echo "reload $(date -u +%H:%M:%S)"
for i in $(seq 1 12); do
  sleep 5
  abertas=$(tail -n +$linhas $LOG | grep -ac "Conexão aberta com sucesso" || true)
  echo "tentativa $i: conexoes abertas=$abertas"
  if [ "$abertas" -ge 10 ]; then break; fi
done
curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
cd /root/whatsapp-crm && git add backend/src/workers/botAtendimentoService.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: texto comprido vai quebrado em bolhas naturais (~120 letras, so em fim de frase)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format="%h"
