set -e
cd /root/crm-de-anuncios
git revert --no-edit HEAD >/dev/null && git log -1 --format='%h %s'
grep -c "robo-" src/pages/AtMetricas.jsx || true
npx vite build 2>&1 | grep -iE "error|built in" | head -3
cp -r dist/* /root/whatsapp-crm/backend/public/anuncios/
echo publicado
