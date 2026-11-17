date -u +%H:%M
P=/root/whatsapp-crm/backend/public/anuncios
echo "== painel publicado tem o Cerebro? =="
grep -l "Cérebro do robô\|Cerebro do robo\|Mapa do cérebro" $P/assets/*.js | head -3
grep -o "Aprendizado da Josy" $P/assets/*.js | head -1
grep -n "cerebro\|Cerebro" /root/crm-de-anuncios/src/components/Sidebar.jsx | head -5
for u in resumo mapa aprendizado licoes; do echo "$u: $(curl -s -o /dev/null -w '%{http_code}' https://crm.nailacademyprofissional.com/api/cerebro/$u)"; done
cd /root/crm-de-anuncios && git log --oneline -4
echo "== josy =="
grep -a '34268c16' /root/whatsapp-crm/logs/app.log | grep -aE 'Socket|Conexão' | tail -4 | cut -c1-150
curl -s https://crm.nailacademyprofissional.com/api/usuarios | grep -o '"id":"34268c16[^}]*' | grep -o '"whatsappConectado":[a-z]*'
