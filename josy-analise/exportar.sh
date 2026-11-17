set -e
# 22/10: exporta conversas + audios da GP (Josy) pra analise no PC do Maicon. So leitura.
U=34268c16-7bed-400a-bf1e-a3d9e37d8774
D=/root/josy-export
rm -rf $D && mkdir -p $D
docker exec gp-postgres-crm psql -U postgres -d testdb -c "\copy (select timestamp, \"chatJid\", \"chatNome\", \"fromMe\", coalesce(\"enviadoPorId\",'') as enviado_por, tipo, texto, coalesce(\"midiaUrl\",'') as midia, \"waId\" from \"Mensagem\" where \"usuarioId\"='$U' and coalesce(apagada,false)=false order by \"chatJid\", timestamp) to stdout with csv header" > $D/mensagens.csv
wc -l $D/mensagens.csv
# etiquetas/agendamentos ajudam a saber quem comprou (se existirem)
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%agend%' or table_name ilike '%etiqueta%' or table_name ilike '%venda%' or table_name ilike '%garantia' or table_name ilike '%contato%') order by 1;" > $D/tabelas.txt
cat $D/tabelas.txt
# lista de audios (loja e cliente)
P=/root/whatsapp-crm/backend/public
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select \"midiaUrl\" from \"Mensagem\" where \"usuarioId\"='$U' and tipo='audio' and \"midiaUrl\" like '/midias/%' and coalesce(\"enviadoPorId\",'')<>'bot'" | sort -u > $D/audios.txt
wc -l < $D/audios.txt
cd $P && sed 's#^/##' $D/audios.txt | while read f; do [ -f "$f" ] && echo "$f"; done > $D/audios-existentes.txt
wc -l < $D/audios-existentes.txt
tar -czf /root/josy-audios.tgz -C $P -T $D/audios-existentes.txt
gzip -c $D/mensagens.csv > /root/josy-mensagens.csv.gz
ls -la /root/josy-audios.tgz /root/josy-mensagens.csv.gz
