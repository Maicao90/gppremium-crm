cd /root/whatsapp-crm/backend
echo "=== logs dir"; ls -la /root/whatsapp-crm/logs/ | head -40
echo "=== CAT_ fluxoPreco"; grep -n "CAT_\|export \|categoria" src/data/fluxoPreco.ts | head -120
echo "=== extrator"; grep -n "CAT_\|export \|categoria\|intenc" src/data/fluxoPrecoExtrator.ts | head -120
echo "=== fluxoCatalogo"; wc -l src/data/fluxoCatalogo.ts; grep -n "export\|^  [a-z_]*:" src/data/fluxoCatalogo.ts | head -150
