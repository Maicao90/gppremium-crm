D=/root/gp-aro/ajuste-final
TSN="/root/ant-lab/node_modules/.bin/ts-node --transpile-only --project /root/ant-lab/tsconfig.json"
cd $D
$TSN teste-unit.ts > unit.txt 2>&1; echo "unit exit=$?"; cat unit.txt
set -a; . /root/whatsapp-crm/backend/.env; set +a
$TSN replay-fora-lista.ts > replay.txt 2>&1; echo "replay exit=$?"; cat replay.txt
