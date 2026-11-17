set -e
B=/root/whatsapp-crm/backend
N=/root/gp-aro/ajuste-final/para-producao/src
echo "md5 producao:"
md5sum $B/src/bot-service/server.ts $B/src/data/medidaJuntada.ts | awk '{print $1, $2}'
[ "$(md5sum < $B/src/bot-service/server.ts | cut -d' ' -f1)" = "124b78adf958f346f2f695645873d3bb" ] || { echo "server.ts MUDOU desde a copia - parando"; exit 1; }
[ "$(md5sum < $B/src/data/medidaJuntada.ts | cut -d' ' -f1)" = "25c3a91a55873b2975fcf629468ac5f6" ] || { echo "medidaJuntada.ts MUDOU - parando"; exit 1; }
ts=$(date +%s)
cd $B && tar -cf /root/backup-ajustes23-$ts.tar src/bot-service/server.ts src/data/medidaJuntada.ts
cp $N/bot-service/server.ts $B/src/bot-service/server.ts
cp $N/data/medidaJuntada.ts $N/data/travaPosOrcamento.ts $B/src/data/
if ! ./node_modules/.bin/tsc --noEmit; then echo "TSC FALHOU - restaurando"; tar -xf /root/backup-ajustes23-$ts.tar -C $B; rm -f $B/src/data/travaPosOrcamento.ts; exit 1; fi
echo TSC_OK
cd /root/whatsapp-crm && git add backend/src/bot-service/server.ts backend/src/data/medidaJuntada.ts backend/src/data/travaPosOrcamento.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: 'aro 16' depois de outro preco cota a mesma largura/perfil (ou pede a medida); corta parcelamento repetido e justificativa de orcamento anterior" && git log -1 --format=%h
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 15); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
cd /root/gp-aro && node teste-aro-prod.js "(c)" | tail -3
