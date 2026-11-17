set -e
P=/root/whatsapp-crm/backend/src
L=/root/ant-lab/src
B=/root/ant-lab/bak-antes-ajuste-final-$(date +%s)
mkdir -p $B
for f in data/comportamentoGuard.manual-test.ts data/comportamentoGuard.ts data/fluxoPrecoExtrator.manual-test.ts workers/agendaWorker.ts workers/whatsappService.ts workers/botAtendimentoService.ts bot-service/server.ts data/tabelaPrecos.ts data/medidaJuntada.ts; do
  mkdir -p $B/$(dirname $f); cp $L/$f $B/$f; cp $P/$f $L/$f
done
diff -rq $P $L | grep -v '\.bak' || echo "LAB = PROD (src)"
echo backup em $B
