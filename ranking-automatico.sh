set -e
B=/root/whatsapp-crm/backend
cp $B/scripts/ranking-publico.js /root/ranking-publico.js.bak-$(date +%s)
python3 /root/ranking-automatico.py $B/scripts/ranking-publico.js $B/public/anuncios/dados/pontuacao.json
cd $B && node -r dotenv/config scripts/ranking-publico.js | tail -1
# a cada 30 min (so le o banco; nao mexe no WhatsApp)
crontab -l | sed 's#^0 9 \* \* \* cd /root/whatsapp-crm/backend && /usr/bin/env node -r dotenv/config scripts/ranking-publico.js#*/30 * * * * cd /root/whatsapp-crm/backend \&\& /usr/bin/env node -r dotenv/config scripts/ranking-publico.js#' | sed 's/1x por dia, 06h de Brasilia/a cada 30 min (agendamentos atualizam sozinhos)/' | crontab -
crontab -l | grep -A1 -B1 ranking
cd /root/whatsapp-crm && git add backend/scripts/ranking-publico.js && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Ranking: periodo vai ate hoje automaticamente (ateAutomatico) e roda a cada 30 min" && git log -1 --format=%h
