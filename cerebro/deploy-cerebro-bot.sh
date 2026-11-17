set -e
B=/root/whatsapp-crm/backend
ts=$(date +%s)
cd $B && tar -cf /root/backup-cerebro-$ts.tar src/bot-service/server.ts
cp /root/ant-lab/src/bot-service/server.ts $B/src/bot-service/server.ts
cp /root/ant-lab/src/bot-service/cerebro.ts $B/src/bot-service/cerebro.ts
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
mkdir -p $B/data/cerebro/revisoes
[ -f $B/data/cerebro/licoes.json ] || echo "[]" > $B/data/cerebro/licoes.json
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
echo "sem token (espera 401): $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/api/cerebro/resumo)"

# nginx: /api/cerebro/ vai pro servico do robo (antes do location / que vai pro whatsapp-crm)
C=/etc/nginx/sites-enabled/crm-nailacademyprofissional.conf
if ! grep -q "location /api/cerebro/" $C; then
  cp $C /root/nginx-crm.conf.bak-$ts
  python3 - "$C" <<'EOF'
import sys
p = sys.argv[1]
s = open(p).read()
bloco = """    # Cerebro do robo (22/10): servido pelo bot-service (reinicia sem derrubar o WhatsApp).
    location /api/cerebro/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {"""
i = s.rfind("    location / {")
s = s[:i] + bloco + s[i + len("    location / {"):]
open(p, "w").write(s)
EOF
  nginx -t && systemctl reload nginx && echo NGINX_OK
fi
echo "pelo dominio sem token (espera 401): $(curl -s -o /dev/null -w '%{http_code}' https://crm.nailacademyprofissional.com/api/cerebro/resumo)"
echo "painel normal: $(curl -s -o /dev/null -w '%{http_code}' https://crm.nailacademyprofissional.com/api/health)"
cd /root/whatsapp-crm && git add backend/src/bot-service/server.ts backend/src/bot-service/cerebro.ts backend/scripts/cerebro-revisao.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Cerebro do robo: ensinamentos do dono valem antes do fluxo (responder/atendente/silencio/orientar), API /api/cerebro e revisao diaria das conversas com sugestoes pra aprovar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format=%h
