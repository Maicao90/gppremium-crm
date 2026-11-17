q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== tabelas com etiqueta/label =="
q "select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%etiq%' or table_name ilike '%label%' or table_name ilike '%tag%');"
for t in $(q "select table_name from information_schema.tables where table_schema='public' and (table_name ilike '%etiq%' or table_name ilike '%label%');"); do
  echo "-- $t: $(q "select string_agg(column_name, ',') from information_schema.columns where table_name='$t';")"
  q "select count(*) from \"$t\";"
done
echo "== mensagens da loja com cara de pos-venda (6 meses) =="
for p in 'avalia' 'g.page\|google.com/maps\|search.google\|writereview' 'obrigad[ao] pela prefer' 'volte sempre' 'comprovante' 'chave pix\|pix:' 'garantia.*(app|aplicativo)|baixe o app' 'nota fiscal' 'seus pneus est'; do
  n=$(q "select count(distinct \"chatJid\") from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and texto ~* '$p';")
  echo "$p => $n conversas"
done
echo "== cliente dizendo que comprou/chegou =="
for p in 'cheguei|to a[ií] na loja|estou a[ií]|j[aá] estou na loja' 'comprei (a[ií]|com voc)|j[aá] comprei com voc' 'paguei|fiz o pix|segue o comprovante'; do
  n=$(q "select count(distinct \"chatJid\") from \"Mensagem\" where \"usuarioId\"='$J' and not \"fromMe\" and texto ~* '$p';")
  echo "$p => $n conversas"
done
