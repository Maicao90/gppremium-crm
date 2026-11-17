P=/root/cerebro-lab-painel; S=$P/.subir
cp $S/cerebroComum.jsx $S/cerebroConstantes.js $S/MapaCerebro.jsx $S/MapaCerebro.css $P/src/components/
cp $S/CerebroRobo.jsx $P/src/pages/CerebroRobo.jsx
cd $P
npx eslint src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/components/cerebroConstantes.js && echo "eslint ok"
npx vite build 2>&1 | grep -E "error|Error|built in" || true
npx vite build --config vite.lab.config.js 2>&1 | grep -E "error|Error|built in" || true
