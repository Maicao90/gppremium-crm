P=/root/whatsapp-crm/backend/src
L=/root/ant-lab/src
rm -rf /root/ant-lab-antes
for f in workers/botAtendimentoService.ts bot-service/server.ts data/medidaJuntada.ts; do diff -u $P/$f $L/$f; done > /root/gp-aro/ajuste-final/ajustes.diff
for f in data/retomadaForaDaLista.ts data/travaPosOrcamento.ts; do diff -u /dev/null $L/$f; done >> /root/gp-aro/ajuste-final/ajustes.diff
mkdir -p /root/gp-aro/ajuste-final/para-producao/src/workers /root/gp-aro/ajuste-final/para-producao/src/bot-service /root/gp-aro/ajuste-final/para-producao/src/data
cp $L/workers/botAtendimentoService.ts /root/gp-aro/ajuste-final/para-producao/src/workers/
cp $L/bot-service/server.ts /root/gp-aro/ajuste-final/para-producao/src/bot-service/
cp $L/data/medidaJuntada.ts $L/data/retomadaForaDaLista.ts $L/data/travaPosOrcamento.ts /root/gp-aro/ajuste-final/para-producao/src/data/
grep -rln "medidaJuntada\|travaPosOrcamento\|retomadaForaDaLista" $L --include=*.ts
md5sum $P/workers/botAtendimentoService.ts $P/bot-service/server.ts $P/data/medidaJuntada.ts
wc -l /root/gp-aro/ajuste-final/ajustes.diff
