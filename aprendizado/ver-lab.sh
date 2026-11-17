date -u +%H:%M
ls -la --time-style=+%H:%M /root/aprendizado-lab-api/ 2>&1 | head -20
ls -la --time-style=+%H:%M /root/aprendizado-lab-painel/src/components/ /root/aprendizado-lab-painel/src/pages/CerebroRobo.jsx 2>&1 | grep -iE "aprend|Cerebro|total"
ls /root/aprendizado-lab-painel/.subir 2>/dev/null
cd /root/aprendizado-lab-api 2>/dev/null && for f in cerebro.ts server.ts; do [ -f $f ] && echo "$f: $(diff <(cat /root/whatsapp-crm/backend/src/bot-service/$f) $f | grep -c '^[<>]') linhas diferentes"; done
tail -5 /root/josy-analise/sintese.log
