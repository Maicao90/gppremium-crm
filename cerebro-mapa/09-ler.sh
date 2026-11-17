B=/root/whatsapp-crm/backend
pm2 jlist 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))if(p.name==='bot-service')console.log(p.pm2_env.exec_interpreter,JSON.stringify(p.pm2_env.node_args),JSON.stringify(p.pm2_env.interpreter_args),p.pm2_env.max_memory_restart)})"
ls $B/node_modules/@types | tr '\n' ' '; echo
cat $B/node_modules/pg/package.json | grep '"version"'
ls $B/ecosystem* 2>/dev/null && grep -n -B2 -A12 "bot-service" $B/ecosystem* | head -40
grep -n "^import" $B/src/services/llmAnthropic.ts
