set -e
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ERR=/root/whatsapp-crm/logs/error.log
ts=$(date +%s)
cd $B && tar -cf /root/backup-eco-$ts.tar src/workers/whatsappService.ts src/workers/agendaWorker.ts
python3 /root/fix-eco.py $B/src/workers/whatsappService.ts $B/src/workers/agendaWorker.ts
if ! ./node_modules/.bin/tsc --noEmit; then echo "TSC FALHOU - restaurando"; tar -xf /root/backup-eco-$ts.tar -C $B; exit 1; fi
echo TSC_OK
cd /root/whatsapp-crm && git add backend/src/workers/whatsappService.ts backend/src/workers/agendaWorker.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: eco do agendamento do proprio robo (retomada) nao pausa a conversa" && git log -1 --format=%h
linhas=$(wc -l < $LOG); linhasErr=$(wc -l < $ERR)
PORT=3001 pm2 reload whatsapp-crm --update-env >/dev/null
echo "reload $(date -u +%H:%M:%S)"
for i in $(seq 1 12); do
  sleep 5
  abertas=$(tail -n +$linhas $LOG | grep -ac "Conexão aberta com sucesso" || true)
  semsessao=$(tail -n +$linhas $LOG | grep -ac "sem sessão registrada" || true)
  echo "tentativa $i: abertas=$abertas sem_sessao=$semsessao"
  [ "$abertas" -ge 10 ] && break
done
sleep 20
echo "device_removed/conflict/logout:"; tail -n +$linhasErr $ERR | grep -aiE "device_removed|conflict|logged ?out" | tail -5 || true
curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
