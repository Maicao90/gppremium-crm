# PUBLICAR o "Mapa do cerebro" (22/10). NAO foi rodado — rodar so com autorizacao do dono:
#   ssh -i ~/.ssh/vps_gppremium root@2.24.212.146 'bash -s' < publicar-mapa-cerebro.sh
# Mexe em: bot-service (reload SO dele — nao toca no whatsapp-crm nem na conexao do WhatsApp) e nos arquivos
# estaticos do painel em backend/public/anuncios. Faz backup de tudo antes e para no primeiro erro.
set -euo pipefail
LAB_API=/root/cerebro-lab-api
LAB_PAINEL=/root/cerebro-lab-painel
BACK=/root/whatsapp-crm/backend
PAINEL=/root/crm-de-anuncios
T=$(date +%s)

# 0) trava: producao nao pode ter mudado desde que o lab copiou (senao a copia apagaria a mudanca de alguem)
cmp -s $LAB_API/cerebro.original.ts $BACK/src/bot-service/cerebro.ts || { echo "ABORTADO: cerebro.ts de producao mudou desde a copia do lab. Refazer o merge."; exit 1; }
cmp -s $LAB_PAINEL/.subir/CerebroRobo.original.jsx $PAINEL/src/pages/CerebroRobo.jsx || { echo "ABORTADO: CerebroRobo.jsx de producao mudou desde a copia do lab. Refazer o merge."; exit 1; }

# 1) backups
tar -cf /root/backup-mapa-cerebro-$T.tar $BACK/src/bot-service/cerebro.ts $PAINEL/src/pages/CerebroRobo.jsx
tar -czf /root/anuncios-bak-mapa-$T.tgz -C $BACK/public anuncios
echo "backups: /root/backup-mapa-cerebro-$T.tar e /root/anuncios-bak-mapa-$T.tgz"

# 2) API: cerebro.ts novo + checagem de tipos igual ao pm2, ANTES do reload
cp $LAB_API/cerebro.ts $BACK/src/bot-service/cerebro.ts
cd $BACK
printf "import './bot-service/cerebro';\nconsole.log('cerebro.ts ok');\n" > src/checar-cerebro.tmp.ts
if ! node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json src/checar-cerebro.tmp.ts; then
  rm -f src/checar-cerebro.tmp.ts; tar -xf /root/backup-mapa-cerebro-$T.tar -C / ; echo "ABORTADO: erro de tipos, cerebro.ts antigo restaurado."; exit 1
fi
rm -f src/checar-cerebro.tmp.ts

# 3) reload SO do bot-service (servico isolado, sem sessao de WhatsApp) e conferencia
pm2 reload bot-service || true
SEM=""; COM=""
for i in $(seq 1 60); do SEM=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3010/api/cerebro/mapa || true); [ "$SEM" = 401 ] && break; sleep 1; done
# 401 sem token so prova que o servico subiu; com token de gerente a rota nova tem que dar 200
if [ "$SEM" = 401 ]; then
  COM=$(cd $BACK && node -e 'require("dotenv").config({quiet:true});const t=require("jsonwebtoken").sign({sub:"publicar",role:"gerente"},process.env.JWT_SECRET,{expiresIn:"2m"});fetch("http://127.0.0.1:3010/api/cerebro/mapa",{headers:{authorization:"Bearer "+t},signal:AbortSignal.timeout(20000)}).then(r=>console.log(r.status)).catch(()=>console.log("erro"))' || true)
fi
echo "bot-service /api/cerebro/mapa: sem token -> $SEM (esperado 401), gerente -> $COM (esperado 200)"
tail -n 5 /root/whatsapp-crm/logs/bot-service.log
if [ "$SEM" != 401 ] || [ "$COM" != 200 ]; then
  echo "FALHOU: voltando o cerebro.ts antigo e recarregando o bot-service. Painel NAO foi mexido."
  tar -xf /root/backup-mapa-cerebro-$T.tar -C /
  pm2 reload bot-service || true
  for i in $(seq 1 60); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/api/cerebro/resumo || true)" = 401 ] && { echo "bot-service antigo de volta no ar."; break; }; sleep 1; done
  exit 1
fi

# 4) painel: arquivos novos/alterados + build + copia pro public/anuncios
cp $LAB_PAINEL/src/components/MapaCerebro.jsx $LAB_PAINEL/src/components/MapaCerebro.css $LAB_PAINEL/src/components/cerebroComum.jsx $LAB_PAINEL/src/components/cerebroConstantes.js $PAINEL/src/components/
cp $LAB_PAINEL/src/pages/CerebroRobo.jsx $PAINEL/src/pages/CerebroRobo.jsx
cd $PAINEL
npx vite build
cp -r dist/* $BACK/public/anuncios/
echo "PRONTO. Abrir o painel > Cérebro do robô > Mapa do cérebro (Ctrl+F5)."
