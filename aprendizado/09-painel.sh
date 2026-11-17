# Aplica o painel no LAB, roda eslint e os dois builds (painel inteiro + pagina de teste).
set -e
LP=/root/aprendizado-lab-painel
IN=$LP/.entrada
cp $IN/CerebroRobo.jsx $LP/src/pages/CerebroRobo.jsx
cp $IN/AprendizadoJosy.jsx $IN/AprendizadoJosy.css $IN/MapaCerebro.jsx $IN/MapaCerebro.css $IN/cerebroComum.jsx $IN/cerebroConstantes.js $LP/src/components/
mkdir -p $LP/lab && cp $IN/lab-main.jsx $LP/lab/main.jsx && cp $IN/lab.html $IN/vite.lab.config.js $LP/
cd $LP
echo "=== eslint"
npx eslint src/components/AprendizadoJosy.jsx src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/components/cerebroConstantes.js src/pages/CerebroRobo.jsx && echo "eslint ok"
echo "=== eslint nos ORIGINAIS (pra comparar)"
npx eslint .subir/originais/*.jsx .subir/originais/*.js 2>&1 | tail -3 || true
echo "=== vite build (painel inteiro, dist do lab)"
npx vite build 2>&1 | grep -E "error|Error|warn|built in|index-" || true
echo "=== vite build (pagina de teste)"
npx vite build --config vite.lab.config.js 2>&1 | grep -E "error|Error|built in|lab" || true
echo "=== arquivo real da analise?"; ls -la /root/josy-analise/aprendizado-josy.json 2>&1
