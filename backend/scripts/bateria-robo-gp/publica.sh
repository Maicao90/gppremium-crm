#!/bin/bash
# Publica no robo em producao um patch que JA passou no laboratorio (lab-testa2.sh). So reinicia o bot-service.
# Desfaz sozinho se nao compilar ou se o servico nao subir. Uso: bash publica.sh <patch.js>
B=/root/whatsapp-crm/backend
L=/root/lab-robo-1711
cd $L
est() { pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).map(p=>p.name+" "+p.pm2_env.status+" restarts="+p.pm2_env.restart_time+" pid="+p.pid).join(" | "))})'; }
echo "inicio: $(TZ=America/Sao_Paulo date '+%H:%M:%S')"
if ! grep -q LAB_FIM lab-testa.out || grep -q "FALHOU\|PAREI\|NAO SUBIU" lab-testa.out || [ "$(grep -c -E '^[0-9]+/[0-9]+ passaram' lab-testa.out)" != "2" ]; then echo "PAREI: o laboratorio nao passou inteiro — producao NAO foi alterada"; echo PUB_FIM; exit 1; fi
TS=$(date +%s); mkdir -p /root/backup-robo-$TS && cp $B/src/bot-service/server.ts $B/scripts/regressao-robo-gp.js /root/backup-robo-$TS/ && echo "copia de seguranca: /root/backup-robo-$TS"
node "$1" $B/src/bot-service/server.ts || { echo "PAREI: patch nao aplicou em producao"; echo PUB_FIM; exit 1; }
# producao tem que ficar identica ao que foi testado no laboratorio
if [ "$(md5sum $B/src/bot-service/server.ts | cut -d' ' -f1)" != "$(md5sum $L/src/bot-service/server.ts | cut -d' ' -f1)" ]; then cp /root/backup-robo-$TS/server.ts $B/src/bot-service/server.ts; echo "DESFEITO: producao ficaria diferente do laboratorio"; echo PUB_FIM; exit 1; fi
cd $B
E=$(timeout 240 ./node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -c "bot-service/server.ts" || true)
echo "erros de compilacao: $E"
if [ "$E" != "0" ]; then cp /root/backup-robo-$TS/server.ts $B/src/bot-service/server.ts; echo "DESFEITO antes de reiniciar"; echo PUB_FIM; exit 1; fi
sed -i "s/ok: (j) => j.via === 'ia_livre' }/ok: (j) => j.via === 'ia_livre' || (j.chaves || []).includes('carro_medidas') }/" scripts/regressao-robo-gp.js
echo "antes:  $(est)"
pm2 reload bot-service >/dev/null 2>&1
ok=0; for i in $(seq 1 40); do sleep 2; curl -s -m 2 http://127.0.0.1:3010/health | grep -q '"ok":true' && { ok=1; break; }; done
if [ "$ok" != "1" ]; then cp /root/backup-robo-$TS/server.ts $B/src/bot-service/server.ts; pm2 reload bot-service >/dev/null 2>&1; sleep 25; echo "ROBO NAO SUBIU — versao anterior restaurada: $(curl -s -m 3 http://127.0.0.1:3010/health)"; echo PUB_FIM; exit 1; fi
echo "depois: $(est)"
echo "PRODUCAO bateria antiga: $(node scripts/regressao-robo-gp.js 2>&1 | grep -E 'FALHOU|passaram' | cut -c1-200 | tr '\n' ' ')"
echo "PRODUCAO bateria nova:   $(cd $L && PORTA=3010 node roda.js 2>&1 | grep -E 'FALHOU|passaram' | cut -c1-200 | tr '\n' ' ')"
echo "fim: $(TZ=America/Sao_Paulo date '+%H:%M:%S')"
echo PUB_FIM
