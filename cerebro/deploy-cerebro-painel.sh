set -e
# revisao com a regra nova (sem preco/medida em texto fixo) + painel + cron diario
cp /root/cerebro-revisao.ts /root/whatsapp-crm/backend/scripts/cerebro-revisao.ts
cd /root/crm-de-anuncios && cp /root/CerebroRobo.jsx src/pages/CerebroRobo.jsx && npx vite build 2>&1 | grep -iE "error|built in" | head -3
P=/root/whatsapp-crm/backend/public/anuncios
tar -czf /root/anuncios-bak-cerebro-$(date +%s).tgz -C /root/whatsapp-crm/backend/public anuncios
cp -r dist/* $P/
git add src/pages/CerebroRobo.jsx src/App.jsx src/components/Sidebar.jsx && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Painel: Cerebro do robo (revisao diaria pra aprovar, ensinamentos, testar o robo)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
cd /root/whatsapp-crm && git add backend/scripts/cerebro-revisao.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Cerebro: sugestao nunca poe preco/medida em texto fixo (usa orientar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
# cron: todo dia 23h30 de Brasilia (02h30 UTC) revisa as conversas do dia
if ! crontab -l | grep -q cerebro-revisao; then
  (crontab -l; echo "# Cerebro do robo: revisao diaria das conversas (23h30 de Brasilia), sugestoes pro dono aprovar no painel"; echo "30 2 * * * cd /root/whatsapp-crm/backend && nice -n 15 ./node_modules/.bin/ts-node --transpile-only -r dotenv/config scripts/cerebro-revisao.ts \$(TZ=America/Sao_Paulo date -d '-3 hours' +\%F) >> /root/whatsapp-crm/logs/cerebro-revisao.log 2>&1") | crontab -
fi
crontab -l | tail -2
# refaz a revisao de hoje com a regra nova (as sugestoes pendentes sao trocadas; nenhuma tinha sido decidida)
cd /root/whatsapp-crm/backend && (nohup nice -n 15 ./node_modules/.bin/ts-node --transpile-only -r dotenv/config scripts/cerebro-revisao.ts 2026-10-22 >> /root/whatsapp-crm/logs/cerebro-revisao.log 2>&1 &)
curl -s -o /dev/null -w "painel %{http_code}\n" https://crm.nailacademyprofissional.com/anuncios/
