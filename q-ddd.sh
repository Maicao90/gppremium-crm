cd /root/whatsapp-crm/backend
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -F ' | ' -c "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== leads de ANUNCIO na GP (14 dias) por DDD (numero real do cliente)"
q "with a as (
  select distinct on (\"chatJid\") \"chatJid\", regexp_replace(split_part(coalesce(\"numeroReal\", \"chatJid\"), ':', 1), '\D', '', 'g') num, timestamp
  from \"Mensagem\" where \"usuarioId\"='$J' and not \"fromMe\" and texto like '%[Anúncio]%' and timestamp > now() - interval '14 days'
  order by \"chatJid\", timestamp)
select case when num like '55%' and length(num) between 12 and 13 then substr(num,3,2) else 'sem numero (lid)' end ddd, count(*) from a group by 1 order by 2 desc limit 20"
echo "== titulos de anuncio que mais trazem DDD fora do 61"
q "select left(split_part(texto, E'\n', 1), 70), count(*) from \"Mensagem\" m where \"usuarioId\"='$J' and not \"fromMe\" and texto like '%[Anúncio]%' and timestamp > now() - interval '14 days'
 and regexp_replace(split_part(coalesce(\"numeroReal\", \"chatJid\"), ':', 1), '\D', '', 'g') ~ '^55(3[1-8])' group by 1 order by 2 desc limit 8"
