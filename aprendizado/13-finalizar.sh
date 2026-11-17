LA=/root/aprendizado-lab-api; LP=/root/aprendizado-lab-painel; S=$LP/.subir
cp $LP/.entrada/publicar-aprendizado-josy.sh $S/ && bash -n $S/publicar-aprendizado-josy.sh && echo "script de publicacao: sintaxe ok"
cd $S
diff -u $LA/.originais/cerebro.ts $LA/src/bot-service/cerebro.ts > cerebro.ts.diff
diff -u $LA/.originais/server.ts $LA/src/bot-service/server.ts > server.ts.diff
diff -u originais/CerebroRobo.jsx $LP/src/pages/CerebroRobo.jsx > CerebroRobo.jsx.diff
for f in MapaCerebro.jsx MapaCerebro.css cerebroComum.jsx cerebroConstantes.js; do diff -u originais/$f $LP/src/components/$f > $f.diff; done
wc -l *.diff
# a publicacao ainda confere: producao igual aos originais?
cmp -s $LA/.originais/cerebro.ts /root/whatsapp-crm/backend/src/bot-service/cerebro.ts && cmp -s $LA/.originais/server.ts /root/whatsapp-crm/backend/src/bot-service/server.ts && echo "producao API = originais do lab"
cmp -s originais/CerebroRobo.jsx /root/crm-de-anuncios/src/pages/CerebroRobo.jsx && echo "producao painel = originais do lab"
ls /root/whatsapp-crm/backend/data/cerebro/
# desliga o servidor de laboratorio
pkill -f "aprendizado-lab-api/src/lab-server.ts" && echo "lab-server desligado" || echo "lab-server ja estava parado"
sleep 1; ss -ltn | grep -c 3017 || true
