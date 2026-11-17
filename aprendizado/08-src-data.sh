# o rsync do setup pulou src/data (o --exclude data pegou a pasta do codigo tambem): copia o codigo que faltou
B=/root/whatsapp-crm/backend
LA=/root/aprendizado-lab-api
rsync -a $B/src/data/ $LA/src/data/
diff -rq $B/src $LA/src | grep -v "bot-service/cerebro.ts\|bot-service/server.ts\|lab-server.ts" || echo "src do lab = producao (fora cerebro.ts, server.ts e lab-server.ts)"
