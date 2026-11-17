cd /root/ant-lab
grep -n "path\.\|readFileSync\|writeFileSync\|/root/" src/bot-service/cerebro.ts | head -20
grep -n "path\.\|readFileSync\|/root/" src/services/botPneusConfig.ts | head -10
ls -la data/ | head -30
grep -n "aro_sem_medida\|INFORMOU_ARO" -r src | grep -v "bot-service/server.ts" | head
