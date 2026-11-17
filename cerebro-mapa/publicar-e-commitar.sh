set -e
bash /root/cerebro-lab-painel/.subir/publicar-mapa-cerebro.sh
cd /root/whatsapp-crm && git add backend/src/bot-service/cerebro.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Cerebro: rota /mapa (neuronios, sinapses reais, ensinamentos ligados, achados) para o mapa interativo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
cd /root/crm-de-anuncios && git add src/components/MapaCerebro.jsx src/components/MapaCerebro.css src/components/cerebroComum.jsx src/components/cerebroConstantes.js src/pages/CerebroRobo.jsx
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Painel: Mapa do cerebro (neuronios e sinapses interativos, ensinar/testar/aprovar pelo mapa)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
curl -s -o /dev/null -w "painel %{http_code}\n" https://crm.nailacademyprofissional.com/anuncios/
curl -s -o /dev/null -w "mapa sem token %{http_code}\n" https://crm.nailacademyprofissional.com/api/cerebro/mapa
curl -s -o /dev/null -w "bot-service health %{http_code}\n" http://127.0.0.1:3010/health
