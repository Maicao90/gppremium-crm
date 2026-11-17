cd /root/whatsapp-crm/backend
q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
echo "== colunas FluxoResposta =="
q "select string_agg(column_name, ',') from information_schema.columns where table_name='FluxoResposta';"
echo "== textos da GP =="
q "select chave, left(replace(partes::text, E'\n',' '), 200) from \"FluxoResposta\" where chave like 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:%' order by chave;" 2>&1 | head -60
echo "== audios por categoria (catalogo) =="
grep -n "audio" src/data/fluxoCatalogo.ts | grep -v "^.*//" | head -30
echo "== licoes atuais =="
node -e 'const l=require("/root/whatsapp-crm/backend/data/cerebro/licoes.json");console.log(l.length);for(const x of l)console.log("-",x.ativo,x.acao,x.situacao.slice(0,80))'
