set -e
B=/root/whatsapp-crm/backend
N=/root/gp-aro/ajuste-final/para-producao/src
LOG=/root/whatsapp-crm/logs/app.log
ERR=/root/whatsapp-crm/logs/error.log
atual=$(md5sum < $B/src/workers/botAtendimentoService.ts | cut -d' ' -f1)
echo "md5 producao botAtendimentoService: $atual"
if [ "$atual" != "53d094244d6c428ef2c47394c4bdc41a" ]; then
  echo "botAtendimentoService.ts MUDOU desde a copia do lab — conferindo o diff da producao com a base do lab"
  diff <(git -C /root/whatsapp-crm show HEAD:backend/src/workers/botAtendimentoService.ts) $B/src/workers/botAtendimentoService.ts | head -5 || true
fi
ts=$(date +%s)
cd $B && tar -cf /root/backup-ajuste1-$ts.tar src/workers/botAtendimentoService.ts
# aplica so o que o lab mudou (patch), pra nao perder nada que a producao tenha de novo
diff -u /root/gp-aro/ajuste-final/base-botAtendimento.ts $N/workers/botAtendimentoService.ts > /tmp/ajuste1.patch 2>/dev/null || true
if [ -s /tmp/ajuste1.patch ] && [ -f /root/gp-aro/ajuste-final/base-botAtendimento.ts ]; then patch -p0 $B/src/workers/botAtendimentoService.ts < /tmp/ajuste1.patch; else
  [ "$atual" = "53d094244d6c428ef2c47394c4bdc41a" ] || { echo "sem base pra patch e a producao mudou — parando sem reiniciar"; exit 1; }
  cp $N/workers/botAtendimentoService.ts $B/src/workers/botAtendimentoService.ts
fi
cp $N/data/retomadaForaDaLista.ts $B/src/data/
if ! ./node_modules/.bin/tsc --noEmit; then echo "TSC FALHOU - restaurando"; tar -xf /root/backup-ajuste1-$ts.tar -C $B; rm -f $B/src/data/retomadaForaDaLista.ts; exit 1; fi
echo TSC_OK
cd /root/whatsapp-crm && git add backend/src/workers/botAtendimentoService.ts backend/src/data/retomadaForaDaLista.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: depois do 'so um instante', medida da tabela sem ninguem da loja ter escrito volta a ser respondida" && git log -1 --format=%h
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
