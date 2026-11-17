set -e
B=/root/whatsapp-crm/backend
S=$B/src/bot-service/server.ts
sed -i "s|media_type: tipoRealDaImagem(m\[2\], m\[1\]), data: m\[2\]|media_type: tipoRealDaImagem(m[2]!, m[1]!), data: m[2]!|" $S
grep -n "tipoRealDaImagem(m" $S
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_OK
# testa no LAB (3011) antes de reiniciar a producao
cp $S /root/ant-lab/src/bot-service/server.ts
bash /root/lab-start.sh >/dev/null 2>&1 || true
for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3011/health || true); [ "$c" = 200 ] && break; sleep 3; done
echo "lab $c"
node /root/teste-ia-erros.js
