bash /root/gp-aro/lab-aplicar.sh || exit 1
cd /root/gp-aro && diff -u /root/ant-lab-bkp-aro-2210/server.ts /root/ant-lab/src/bot-service/server.ts > server.diff; diff -u /root/ant-lab-bkp-aro-2210/tabelaPrecos.ts /root/ant-lab/src/data/tabelaPrecos.ts > tabelaPrecos.diff
grep -n "^@@" server.diff tabelaPrecos.diff
echo "== producao intocada?"
for f in src/bot-service/server.ts src/data/tabelaPrecos.ts; do cmp -s /root/ant-lab-bkp-aro-2210/$(basename $f) /root/whatsapp-crm/backend/$f && echo "prod $f = original (sem mudanca)"; done
ls /root/whatsapp-crm/backend/src/data/medidaJuntada.ts 2>/dev/null || echo "prod sem medidaJuntada.ts (ok)"
cd /root/whatsapp-crm/backend && git status --short src/ | head
bash /root/lab-start.sh
node /root/gp-aro/teste-aro.js REAL
