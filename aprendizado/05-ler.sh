B=/root/whatsapp-crm/backend
sed -n 1,30p $B/src/auth/jwt.ts
echo "=== ecosystem bot-service"; grep -n -A8 "bot-service" $B/ecosystem.config.js | head -30
echo "=== apiBase"; cat /root/crm-de-anuncios/src/apiBase.js 2>/dev/null || ls /root/crm-de-anuncios/src | head -30
echo "=== tsconfig"; cat $B/tsconfig.json
echo "=== typescript"; ls $B/node_modules/.bin | grep -E "^tsc$|ts-node$"
echo "=== nginx midias"; grep -n "midias" /etc/nginx/sites-enabled/* | head
echo "=== express static midias"; grep -rn "midias" $B/src/server.ts | head -5
