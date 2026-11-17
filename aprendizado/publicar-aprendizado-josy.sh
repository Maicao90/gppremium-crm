# PUBLICAR o "Aprendizado da Josy" (22/10). NAO foi rodado — rodar so com autorizacao do dono (e fora do horario de loja):
#   ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 'bash -s' < publicar-aprendizado-josy.sh
# Mexe em: cerebro.ts + server.ts do bot-service (reload SO dele — nao toca no whatsapp-crm nem na conexao do WhatsApp)
# e nos arquivos estaticos do painel em backend/public/anuncios. Backup de tudo antes; para no primeiro erro.
# NAO copia o aprendizado-josy.json: o arquivo de propostas vai pra data/cerebro/ num passo separado, quando o dono quiser.
set -euo pipefail
LAB_API=/root/aprendizado-lab-api
LAB_PAINEL=/root/aprendizado-lab-painel
ORIG_PAINEL=$LAB_PAINEL/.subir/originais
BACK=/root/whatsapp-crm/backend
PAINEL=/root/crm-de-anuncios
T=$(date +%s)

# 0) trava: producao nao pode ter mudado desde que o lab copiou (senao a copia apagaria a mudanca de alguem)
cmp -s $LAB_API/.originais/cerebro.ts $BACK/src/bot-service/cerebro.ts || { echo "ABORTADO: cerebro.ts de producao mudou desde a copia do lab. Refazer o merge."; exit 1; }
cmp -s $LAB_API/.originais/server.ts $BACK/src/bot-service/server.ts || { echo "ABORTADO: server.ts de producao mudou desde a copia do lab. Refazer o merge."; exit 1; }
cmp -s $ORIG_PAINEL/CerebroRobo.jsx $PAINEL/src/pages/CerebroRobo.jsx || { echo "ABORTADO: CerebroRobo.jsx de producao mudou."; exit 1; }
for f in MapaCerebro.jsx MapaCerebro.css cerebroComum.jsx cerebroConstantes.js; do
  cmp -s $ORIG_PAINEL/$f $PAINEL/src/components/$f || { echo "ABORTADO: $f de producao mudou."; exit 1; }
done
[ -e $PAINEL/src/components/AprendizadoJosy.jsx ] && { echo "ABORTADO: AprendizadoJosy.jsx ja existe em producao."; exit 1; }

# 1) backups
tar -cf /root/backup-aprendizado-josy-$T.tar $BACK/src/bot-service/cerebro.ts $BACK/src/bot-service/server.ts \
  $PAINEL/src/pages/CerebroRobo.jsx $PAINEL/src/components/MapaCerebro.jsx $PAINEL/src/components/MapaCerebro.css $PAINEL/src/components/cerebroComum.jsx $PAINEL/src/components/cerebroConstantes.js
tar -czf /root/anuncios-bak-josy-$T.tgz -C $BACK/public anuncios
echo "backups: /root/backup-aprendizado-josy-$T.tar e /root/anuncios-bak-josy-$T.tgz"
voltar_api() { tar -xf /root/backup-aprendizado-josy-$T.tar -C / $(tar -tf /root/backup-aprendizado-josy-$T.tar | grep bot-service); }

# 2) API: arquivos novos + checagem de tipos (tsc com o tsconfig da producao, sobre o server.ts e tudo que ele importa) ANTES do reload
cp $LAB_API/src/bot-service/cerebro.ts $BACK/src/bot-service/cerebro.ts
cp $LAB_API/src/bot-service/server.ts $BACK/src/bot-service/server.ts
cd $BACK
printf '{ "extends": "./tsconfig.json", "include": [], "files": ["src/bot-service/server.ts"], "compilerOptions": { "noEmit": true } }\n' > tsconfig.checar-josy.json
if ! timeout 300 node_modules/.bin/tsc -p tsconfig.checar-josy.json; then
  rm -f tsconfig.checar-josy.json; voltar_api; echo "ABORTADO: erro de tipos, cerebro.ts/server.ts antigos restaurados (nada reiniciado)."; exit 1
fi
rm -f tsconfig.checar-josy.json

# 3) reload SO do bot-service (servico isolado, sem sessao de WhatsApp) e conferencia das rotas
pm2 reload bot-service || true
SEM=""; COM=""; MAPA=""
for i in $(seq 1 60); do SEM=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/api/cerebro/aprendizado || true); [ "$SEM" = 401 ] && break; sleep 1; done
if [ "$SEM" = 401 ]; then
  COM=$(node -e 'require("dotenv").config({quiet:true});const t=require("jsonwebtoken").sign({sub:"publicar",role:"gerente"},process.env.JWT_SECRET,{expiresIn:"2m"});fetch("http://127.0.0.1:3010/api/cerebro/aprendizado",{headers:{authorization:"Bearer "+t},signal:AbortSignal.timeout(20000)}).then(r=>console.log(r.status)).catch(()=>console.log("erro"))' || true)
  MAPA=$(node -e 'require("dotenv").config({quiet:true});const t=require("jsonwebtoken").sign({sub:"publicar",role:"gerente"},process.env.JWT_SECRET,{expiresIn:"2m"});fetch("http://127.0.0.1:3010/api/cerebro/mapa",{headers:{authorization:"Bearer "+t},signal:AbortSignal.timeout(30000)}).then(r=>console.log(r.status)).catch(()=>console.log("erro"))' || true)
fi
echo "bot-service /api/cerebro/aprendizado: sem token -> $SEM (esperado 401), gerente -> $COM (esperado 200); /mapa gerente -> $MAPA (esperado 200)"
tail -n 5 /root/whatsapp-crm/logs/bot-service.log
if [ "$SEM" != 401 ] || [ "$COM" != 200 ] || [ "$MAPA" != 200 ]; then
  echo "FALHOU: voltando cerebro.ts/server.ts antigos e recarregando o bot-service. Painel NAO foi mexido."
  voltar_api
  pm2 reload bot-service || true
  for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/api/cerebro/resumo || true)" = 401 ] && { echo "bot-service antigo de volta no ar."; break; }; sleep 1; done
  exit 1
fi

# 4) painel: arquivos novos/alterados + build + copia pro public/anuncios
cp $LAB_PAINEL/src/components/AprendizadoJosy.jsx $LAB_PAINEL/src/components/AprendizadoJosy.css $LAB_PAINEL/src/components/MapaCerebro.jsx \
   $LAB_PAINEL/src/components/MapaCerebro.css $LAB_PAINEL/src/components/cerebroComum.jsx $LAB_PAINEL/src/components/cerebroConstantes.js $PAINEL/src/components/
cp $LAB_PAINEL/src/pages/CerebroRobo.jsx $PAINEL/src/pages/CerebroRobo.jsx
cd $PAINEL
timeout 300 npx vite build
cp -r dist/* $BACK/public/anuncios/
echo "PRONTO. Painel > Cérebro do robô > Aprendizado da Josy (Ctrl+F5). Sem data/cerebro/aprendizado-josy.json a aba mostra 'ainda não terminou'."
