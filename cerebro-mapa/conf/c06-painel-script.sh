set -u
T=$(date +%s)
L=/root/cerebro-lab-painel
cp $L/src/components/MapaCerebro.jsx $L/src/components/MapaCerebro.jsx.antes-conf-$T
cp $L/.subir/MapaCerebro.jsx $L/.subir/MapaCerebro.jsx.antes-conf-$T
cp $L/.subir/publicar-mapa-cerebro.sh $L/.subir/publicar-mapa-cerebro.sh.antes-conf-$T
cp /tmp/MapaCerebro.conf.jsx $L/src/components/MapaCerebro.jsx
cp /tmp/MapaCerebro.conf.jsx $L/.subir/MapaCerebro.jsx
cp /tmp/publicar-mapa-cerebro.conf.sh $L/.subir/publicar-mapa-cerebro.sh
md5sum $L/src/components/MapaCerebro.jsx $L/.subir/MapaCerebro.jsx $L/.subir/publicar-mapa-cerebro.sh
echo "== bash -n publicar"; bash -n $L/.subir/publicar-mapa-cerebro.sh && echo sintaxe ok
echo "== eslint"; cd $L && timeout 120 npx eslint src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/components/cerebroConstantes.js src/pages/CerebroRobo.jsx 2>&1 | tail -20
echo "== build"; timeout 300 npx vite build 2>&1 | grep -E "built in|error|Error" | head
echo "== testa o one-liner do health check contra servidor conf"
C=/root/cerebro-conf; cd $C
CONF_PORTA=3016 nohup node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/conf-server.ts > $C/conf-server.log 2>&1 &
P=$!
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3016/api/cerebro/mapa && break; sleep 1; done
SEM=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3016/api/cerebro/mapa || true)
COM=$(cd /root/whatsapp-crm/backend && node -e 'require("dotenv").config({quiet:true});const t=require("jsonwebtoken").sign({sub:"publicar",role:"gerente"},process.env.JWT_SECRET,{expiresIn:"2m"});fetch("http://127.0.0.1:3016/api/cerebro/mapa",{headers:{authorization:"Bearer "+t},signal:AbortSignal.timeout(20000)}).then(r=>console.log(r.status)).catch(()=>console.log("erro"))' || true)
echo "sem=$SEM com=$COM"
kill $P; sleep 1; pkill -f "src/conf-server.ts"; ss -ltn | grep -E ':3016 ' || echo "3016 livre"
