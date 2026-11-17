cd /root/whatsapp-crm/backend
echo "=== schema FluxoEvento"; grep -n -A 25 "model FluxoEvento" prisma/schema.prisma
echo "=== routes/fluxo.ts"; wc -l src/routes/fluxo.ts; grep -n "router\.\(get\|post\|put\|delete\)" src/routes/fluxo.ts
echo "=== ao-vivo"; grep -n -A 60 "ao-vivo" src/routes/fluxo.ts | head -120
echo "=== registrarEventoFluxo"; grep -rn -A 30 "function registrarEventoFluxo" src/services | head -60
echo "=== pg disponivel?"; ls node_modules | grep -E "^pg$|^postgres$|^@prisma$" ; ls node_modules/.prisma/client 2>/dev/null | head
echo "=== montagem /api/fluxo"; grep -rn "api/fluxo" src/*.ts src/app* 2>/dev/null | head
echo "=== tsconfig"; cat tsconfig.json | head -40
echo "=== pacote bot-service"; grep -n "bot-service\|scripts" -A 3 package.json | head -30
pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))console.log(p.name,p.pm2_env.pm_exec_path,(p.pm2_env.args||[]).join(' '),p.pm2_env.pm_cwd)})"
