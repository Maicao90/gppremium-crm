cd /root/whatsapp-crm/backend/data/leituras-imagem
for f in $(grep -ril "TAB\|tabela de pre" . | head -20); do
  b=$(basename $f .txt)
  echo "=========== $b  ($(date -r $f '+%d/%m %H:%M'))"
  docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), \"usuarioId\", \"chatJid\", \"fromMe\" from \"Mensagem\" where \"midiaUrl\" like '%$b' limit 2;"
  head -c 600 $f; echo
done
echo "== fotos mandadas pelo numero do Maicon/dono pra GP nos ultimos 3 dias =="
docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), \"chatJid\", \"chatNome\", \"fromMe\", \"midiaUrl\" from \"Mensagem\" where tipo='imagem' and \"usuarioId\"='34268c16-7bed-400a-bf1e-a3d9e37d8774' and \"chatNome\" ilike any (array['%maicon%','%bruno%','%dono%','%meireles%']) and timestamp > now() - interval '5 days' order by timestamp desc limit 20;"
