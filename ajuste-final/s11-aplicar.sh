set -e
D=/root/gp-aro/ajuste-final
L=/root/ant-lab/src
cp $D/novo/server.ts $L/bot-service/server.ts
cp $D/novo/medidaJuntada.ts $L/data/medidaJuntada.ts
cp $D/novo/travaPosOrcamento.ts $L/data/travaPosOrcamento.ts
cp $D/novo/retomadaForaDaLista.ts $L/data/retomadaForaDaLista.ts
cp $D/novo/botAtendimentoService.ts $L/workers/botAtendimentoService.ts
cd /root/ant-lab
set +e
./node_modules/.bin/tsc --noEmit -p . > $D/tsc-depois.txt 2>&1; echo "tsc exit=$?"; cat $D/tsc-depois.txt
cd $D
/root/ant-lab/node_modules/.bin/ts-node --transpile-only teste-unit.ts > unit.txt 2>&1; echo "unit exit=$?"; cat unit.txt
set -a; . /root/whatsapp-crm/backend/.env; set +a
/root/ant-lab/node_modules/.bin/ts-node --transpile-only replay-fora-lista.ts > replay.txt 2>&1; echo "replay exit=$?"; cat replay.txt
