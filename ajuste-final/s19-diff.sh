P=/root/whatsapp-crm/backend/src
L=/root/ant-lab/src
cd /root
for f in workers/botAtendimentoService.ts bot-service/server.ts data/medidaJuntada.ts; do diff -u $P/$f $L/$f; done > /root/gp-aro/ajuste-final/ajustes.diff
for f in data/retomadaForaDaLista.ts data/travaPosOrcamento.ts; do diff -u /dev/null $L/$f; done >> /root/gp-aro/ajuste-final/ajustes.diff
# confere que a producao nao foi tocada (mesmos arquivos de quando copiei pro lab)
ls -la --time-style=full-iso $P/workers/botAtendimentoService.ts $P/bot-service/server.ts $P/data/medidaJuntada.ts
ls $P/data/retomadaForaDaLista.ts $P/data/travaPosOrcamento.ts 2>&1
cd /root/whatsapp-crm/backend && git status --short src | head
wc -l /root/gp-aro/ajuste-final/ajustes.diff
