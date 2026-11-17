set -e
B=/root/whatsapp-crm/backend
P=/root/crm-de-anuncios
ts=$(date +%s)
cp $P/src/pages/AtMetricas.jsx /root/AtMetricas.jsx.bak-$ts
cp $B/scripts/ranking-publico.js /root/ranking-publico.js.bak-$ts
python3 /root/ranking-com-robo.py $P/src/pages/AtMetricas.jsx $B/scripts/ranking-publico.js
grep -n "isoDia" $P/src/pages/AtMetricas.jsx | head -2
cd $B && node -r dotenv/config scripts/ranking-publico.js | tail -1
cd $P && npx vite build 2>&1 | grep -iE "error|built in" | head -3
cp -r dist/* $B/public/anuncios/
git add src/pages/AtMetricas.jsx && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Pontuacao: agendamentos do robo contam igual a tabela do mes (dia de envio no mes da campanha)" && git log -1 --format=%h
cd /root/whatsapp-crm && git add backend/scripts/ranking-publico.js && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Ranking publico: agendamentos do robo contam igual a tabela do mes" && git log -1 --format=%h
