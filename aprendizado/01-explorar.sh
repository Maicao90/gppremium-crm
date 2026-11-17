B=/root/whatsapp-crm/backend
P=/root/crm-de-anuncios
ls /root/
echo "=== labs existentes"; ls -la /root/aprendizado-lab-api /root/aprendizado-lab-painel 2>&1 | head
echo "=== tamanhos"
wc -l $B/src/bot-service/cerebro.ts $B/src/bot-service/server.ts $P/src/pages/CerebroRobo.jsx $P/src/components/MapaCerebro.jsx $P/src/components/cerebroComum.jsx $P/src/components/cerebroConstantes.js $P/src/components/MapaCerebro.css
echo "=== git backend"; cd /root/whatsapp-crm && git status --short | head -30; git log --oneline -6
echo "=== git painel"; cd $P && git status --short | head -30; git log --oneline -6
echo "=== data cerebro"; ls -la $B/data/cerebro $B/data/cerebro/revisoes
echo "=== midias"; ls $B/public/midias | head -5; ls $B/public/midias | wc -l; ls -la $B/public/midias/bot-audios | head -30
ls $B/public/midias/*.ogg 2>/dev/null | head -5
echo "=== mtimes producao"; stat -c '%y %n' $B/src/bot-service/cerebro.ts $P/src/pages/CerebroRobo.jsx $P/src/components/MapaCerebro.jsx $P/src/components/cerebroComum.jsx $P/src/components/cerebroConstantes.js
echo "=== cmp com lab anterior"
cmp $B/src/bot-service/cerebro.ts /root/cerebro-lab-api/cerebro.ts && echo "cerebro.ts = lab anterior"
cmp $P/src/components/MapaCerebro.jsx /root/cerebro-lab-painel/src/components/MapaCerebro.jsx && echo "MapaCerebro = lab anterior"
cmp $P/src/pages/CerebroRobo.jsx /root/cerebro-lab-painel/src/pages/CerebroRobo.jsx && echo "CerebroRobo = lab anterior"
echo "=== portas"; ss -ltnp | grep -E ':30[0-9][0-9]'
echo "=== marcador audio no server.ts"
grep -n "ENVIAR_AUDIO\|audioFluxo" $B/src/bot-service/*.ts $B/src/**/*.ts 2>/dev/null | head -40
grep -rn "ENVIAR_AUDIO" $B/src --include=*.ts | head -30
