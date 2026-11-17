cd /root/crm-de-anuncios
cat package.json
echo "=== src tree"; ls src src/pages src/lib src/services src/api 2>/dev/null
echo "=== git"; git log --oneline -3; git status --short | head
echo "=== CerebroRobo.jsx"; cat -n src/pages/CerebroRobo.jsx
echo "=== como CerebroRobo e usado"; grep -rn "CerebroRobo" src --include=*.jsx --include=*.js | grep -v "pages/CerebroRobo.jsx"
echo "=== tailwind?"; ls tailwind.config.* postcss.config.* 2>/dev/null; head -30 src/index.css
cd /root/whatsapp-crm/backend
echo "=== FluxoResposta"; grep -n -A 10 "model FluxoResposta" prisma/schema.prisma
echo "=== imports"; head -15 src/services/llmAnthropic.ts | grep import; grep -n "^import" src/data/fluxoCatalogo.ts
cat data/bot-lojas.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(Object.keys(j))})"
