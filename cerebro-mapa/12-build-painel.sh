P=/root/cerebro-lab-painel
echo "=== vite.config.js"; cat $P/vite.config.js
cd $P
cp $P/.subir/cerebroComum.jsx $P/.subir/MapaCerebro.jsx $P/.subir/MapaCerebro.css $P/src/components/
cp $P/.subir/CerebroRobo.jsx $P/src/pages/CerebroRobo.jsx
# build no lab: saida em dist/ do proprio lab, cache fora do node_modules de producao
echo "=== build"
npx vite build --outDir $P/dist --emptyOutDir 2>&1 | tail -n 25
ls -la $P/dist $P/dist/assets | head -20
