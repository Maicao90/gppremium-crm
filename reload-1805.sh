#!/bin/bash
# 22/10 18:05 BRT: reload do whatsapp-crm pra valer o anti-loop novo (commit 2b5d8fd5). Dono: "termina o que ainda tem".
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ERR=/root/whatsapp-crm/logs/error.log
OUT=/root/reload-1805.log
{
  echo "inicio $(date -u)"
  cd $B && ./node_modules/.bin/tsc --noEmit || { echo "TSC FALHOU — reload cancelado"; exit 1; }
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
  sleep 30
  echo "device_removed/conflict/logout depois do reload:"
  tail -n +$linhasErr $ERR | grep -aiE "device_removed|conflict|logged ?out" | tail -5 || true
  curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
  echo "fim $(date -u)"
} >> $OUT 2>&1
