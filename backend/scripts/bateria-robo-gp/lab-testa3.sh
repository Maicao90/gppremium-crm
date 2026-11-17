#!/bin/bash
# Laboratorio = copia exata do server.ts de PRODUCAO + patch novo. Roda as baterias e (se pedido e se passarem) a
# simulacao de 1.000 conversas. NAO toca em producao. Uso: bash lab-testa3.sh <patch-novo.js> [sim]
L=/root/lab-robo-1711
B=/root/whatsapp-crm/backend
cd $L
echo "inicio: $(TZ=America/Sao_Paulo date '+%H:%M:%S')"
cp $B/src/bot-service/server.ts src/bot-service/server.ts && echo "base do lab = producao"
cp $B/scripts/regressao-robo-gp.js regressao.js && sed -i "s#127.0.0.1:3010#127.0.0.1:3019#" regressao.js
node "$1" src/bot-service/server.ts || { echo "PAREI: patch nao aplicou"; echo LAB_FIM; exit 1; }
E=$(timeout 240 ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "bot-service/server.ts" | head -8)
echo "erros de compilacao: ${E:-nenhum}"
[ -z "$E" ] || { echo "PAREI: nao compila"; echo LAB_FIM; exit 1; }
bash sobe.sh reinicia > bateria-lab.out 2>&1
grep -E -A2 "FALHOU|passaram|NAO SUBIU" bateria-lab.out | cut -c1-420
if [ "$2" = "sim" ] && [ "$(grep -c -E '^[0-9]+/[0-9]+ passaram' bateria-lab.out)" = "2" ] && ! grep -q FALHOU bateria-lab.out; then
  rm -f sim-resultado.jsonl
  node sim.js ${SIMN:-1000} > sim.out 2> sim.err
  tail -1 sim.err
  cp sim-resultado.jsonl sim-rodada-ultima.jsonl
  node analisa.js 0 2>&1 | sed -n '1,14p;/== CHECAGENS/,/V8/p'
fi
P=$(ss -ltnp 2>/dev/null | grep "127.0.0.1:3019 " | grep -o "pid=[0-9]*" | head -1 | cut -d= -f2); [ -n "$P" ] && kill "$P" && echo "lab desligado"
echo "fim: $(TZ=America/Sao_Paulo date '+%H:%M:%S')"
echo LAB_FIM
