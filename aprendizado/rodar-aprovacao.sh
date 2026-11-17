set -e
B=/root/whatsapp-crm/backend
ts=$(date +%s)
cp $B/data/cerebro/licoes.json /root/licoes-antes-josy-$ts.json
[ -f $B/data/cerebro/aprendizado-josy.json ] || cp /root/josy-analise/aprendizado-josy.json $B/data/cerebro/aprendizado-josy.json
node /root/aplicar-aprovacao.js
ls -la $B/public/midias/bot-audios/
