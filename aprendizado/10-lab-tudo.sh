# Reaplica API + painel no LAB, lint/build, sobe o servidor de lab (nohup + timeout 40 min) e roda os testes.
LA=/root/aprendizado-lab-api; LP=/root/aprendizado-lab-painel
cp $LP/.entrada/AprendizadoJosy.jsx $LP/src/components/
cd $LP
echo "=== eslint (arquivos novos/alterados; CerebroRobo.jsx linha 113 ja dava esse erro no original)"
timeout 120 npx eslint src/components/AprendizadoJosy.jsx src/components/MapaCerebro.jsx src/components/cerebroComum.jsx src/components/cerebroConstantes.js 2>&1 | tail -5 && echo "eslint ok"
timeout 120 npx eslint .subir/originais/CerebroRobo.jsx 2>&1 | grep -E "^\s+[0-9]+:" || true
timeout 180 npx vite build 2>&1 | grep -E "error|built in" || true
timeout 180 npx vite build --config vite.lab.config.js 2>&1 | grep -E "error|built in" || true
cd $LA
cp .entrada/cerebro.ts src/bot-service/cerebro.ts
timeout 300 node_modules/.bin/tsc -p tsconfig.checar.json > tsc.log 2>&1 && echo "tsc: sem erros" || head -20 tsc.log
# dados do teste automatico: exemplo
cp aprendizado-josy.exemplo.json data/cerebro/aprendizado-josy.json; echo '[]' > data/cerebro/licoes.json; rm -f public/midias/bot-audios/josy-*.ogg
pkill -f "aprendizado-lab-api/src/lab-server.ts" || true; sleep 1
nohup timeout 2400 node_modules/.bin/ts-node --prefer-ts-exts --project tsconfig.json $LA/src/lab-server.ts > $LA/lab-server.log 2>&1 &
for i in $(seq 1 90); do grep -q "ouvindo" lab-server.log && break; sleep 1; done
cat lab-server.log
timeout 120 node testar-aprendizado.js 2>&1 | grep -E "FALHOU|TUDO OK|FALHA|ERRO|aprovar com audio|copiado|comeca com"
# guarda a evidencia do teste
rm -rf evidencia-teste && mkdir evidencia-teste && cp data/cerebro/licoes.json data/cerebro/aprendizado-josy.json evidencia-teste/ && ls -la public/midias/bot-audios > evidencia-teste/bot-audios.txt
echo "=== arquivo REAL da analise"; ls -la /root/josy-analise/aprendizado-josy.json
node -e 'const j=require("/root/josy-analise/aprendizado-josy.json");console.log("propostas:",j.propostas.length,"conversas:",j.conversasLidas);const a=j.propostas.flatMap(p=>p.audios||[]);console.log("audios:",a.length);console.log("ligadoA null:",j.propostas.filter(p=>!p.ligadoA).length);console.log(j.propostas.slice(0,40).map(p=>p.id+" | "+p.sugestao?.acao+" | "+(p.audios||[]).length).join("\n"))'
