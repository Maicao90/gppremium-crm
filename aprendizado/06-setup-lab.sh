# LAB do "Aprendizado da Josy" (22/10): copias NOVAS, nada aponta pra producao.
set -e
B=/root/whatsapp-crm/backend
P=/root/crm-de-anuncios
LA=/root/aprendizado-lab-api
LP=/root/aprendizado-lab-painel
[ -e $LA ] && { echo "ABORTADO: $LA ja existe"; exit 1; }
[ -e $LP ] && { echo "ABORTADO: $LP ja existe"; exit 1; }

# ---- API: codigo do backend (sem node_modules, sem public, sem data, sem dist) + symlink pro node_modules original
mkdir -p $LA
rsync -a --exclude node_modules --exclude public --exclude data --exclude dist --exclude logs --exclude .stage2309 --exclude scratch --exclude dump-ontem \
  --include 'src/***' --include tsconfig.json --include package.json --exclude '*' $B/ $LA/
ln -s $B/node_modules $LA/node_modules
# originais (trava do script de publicacao: producao nao pode ter mudado desde aqui)
mkdir -p $LA/.originais
cp $B/src/bot-service/cerebro.ts $LA/.originais/cerebro.ts
cp $B/src/bot-service/server.ts $LA/.originais/server.ts
# dados: COPIAS de data/cerebro + lojas
mkdir -p $LA/data
cp -r $B/data/cerebro $LA/data/
cp $B/data/bot-lojas.json $LA/data/
# public/midias FALSA: so 4 audios reais da Josy copiados + os audios do robo (bot-audios) copiados
mkdir -p $LA/public/midias/bot-audios
for f in 3EB063BD2D9FB5B1A48B89_398454.ogg 3EB000E1241DAA66BD2E2B_536245.ogg 3EB01768006C61D6F29367_755806.ogg 3EB010B52F32479DF651F2_568262.ogg; do
  cp $B/public/midias/$f $LA/public/midias/
done
cp $B/public/midias/bot-audios/*.ogg $LA/public/midias/bot-audios/
for f in $LA/public/midias/*.ogg; do printf "%s " "$(basename $f)"; ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"; done

# ---- painel
mkdir -p $LP
rsync -a --exclude node_modules --exclude dist --exclude .git $P/ $LP/
ln -s $P/node_modules $LP/node_modules
mkdir -p $LP/.subir/originais
cp $P/src/pages/CerebroRobo.jsx $P/src/components/MapaCerebro.jsx $P/src/components/MapaCerebro.css $P/src/components/cerebroComum.jsx $P/src/components/cerebroConstantes.js $LP/.subir/originais/
ls -la $LA $LA/data/cerebro $LA/public/midias $LA/public/midias/bot-audios
ls -la $LP | head -30
du -sh $LA $LP
