set -e
cd /root/crm-de-anuncios
cp src/pages/Garantia50k.jsx /root/Garantia50k.jsx.bak-$(date +%s)
cp /root/vist-lab/painel/src/pages/Garantia50k.jsx src/pages/Garantia50k.jsx
npx vite build 2>&1 | grep -iE "error|built in" | head -3
tar -czf /root/anuncios-bak-vrapida-$(date +%s).tgz -C /root/whatsapp-crm/backend/public anuncios
cp -r dist/* /root/whatsapp-crm/backend/public/anuncios/
git add src/pages/Garantia50k.jsx && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Garantia: aba Vistorias mostra a Vistoria rapida (etiqueta e detalhe proprio)" && git log -1 --format=%h
# backend pronto para o proximo reinicio (so copia se a producao ainda for a base do lab)
md5sum /root/whatsapp-crm/backend/src/routes/garantia.ts
