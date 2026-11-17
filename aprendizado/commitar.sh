cd /root/whatsapp-crm
git add backend/src/bot-service/cerebro.ts backend/src/bot-service/server.ts
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Cerebro: Aprendizado da Josy (propostas tiradas das conversas dela, aprovar com audio vira ensinamento com o audio dela)"
git log -1 --format=%h
cd /root/crm-de-anuncios
git add src/components/AprendizadoJosy.jsx src/components/AprendizadoJosy.css src/components/MapaCerebro.jsx src/components/MapaCerebro.css src/components/cerebroComum.jsx src/components/cerebroConstantes.js src/pages/CerebroRobo.jsx
git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Painel: aba Aprendizado da Josy no Cerebro (ouvir os audios dela, aprovar/ignorar cada proposta)"
git log -1 --format=%h
