# Aplica a correcao SO no laboratorio (/root/ant-lab). Guarda copia dos originais do lab antes.
set -e
cd /root/ant-lab
mkdir -p /root/ant-lab-bkp-aro-2210
[ -f /root/ant-lab-bkp-aro-2210/server.ts ] || cp src/bot-service/server.ts /root/ant-lab-bkp-aro-2210/server.ts
[ -f /root/ant-lab-bkp-aro-2210/tabelaPrecos.ts ] || cp src/data/tabelaPrecos.ts /root/ant-lab-bkp-aro-2210/tabelaPrecos.ts
cp /root/gp-aro/server.ts src/bot-service/server.ts
cp /root/gp-aro/tabelaPrecos.ts src/data/tabelaPrecos.ts
cp /root/gp-aro/medidaJuntada.ts src/data/medidaJuntada.ts
echo "== tsc"
./node_modules/.bin/tsc --noEmit -p . 2>&1 | head -30
echo "tsc exit ${PIPESTATUS[0]}"
