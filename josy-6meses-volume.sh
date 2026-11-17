q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
U=34268c16-7bed-400a-bf1e-a3d9e37d8774
echo "== conta da GP (Josy) =="
q "select nome, \"lojaId\" from \"Usuario\" where id='$U';"
echo "== volume por mes (mensagens / conversas / audios da loja / audios do cliente) =="
q "select to_char(date_trunc('month',timestamp),'YYYY-MM') mes, count(*) msgs, count(distinct \"chatJid\") conversas,
   count(*) filter (where \"fromMe\" and tipo='audio' and coalesce(\"enviadoPorId\",'')<>'bot') audios_loja,
   count(*) filter (where not \"fromMe\" and tipo='audio') audios_cliente,
   count(*) filter (where \"fromMe\" and \"enviadoPorId\"='bot') do_robo
   from \"Mensagem\" where \"usuarioId\"='$U' and timestamp > now() - interval '6 months' group by 1 order by 1;"
echo "== mensagem mais antiga da GP no banco =="
q "select min(timestamp) from \"Mensagem\" where \"usuarioId\"='$U';"
echo "== arquivos de audio da loja existem no disco? (amostra) =="
P=/root/whatsapp-crm/backend/public
tot=0; ok=0
for f in $(q "select \"midiaUrl\" from \"Mensagem\" where \"usuarioId\"='$U' and \"fromMe\" and tipo='audio' and coalesce(\"enviadoPorId\",'')<>'bot' and \"midiaUrl\" is not null and timestamp > now() - interval '6 months' order by random() limit 200;"); do
  tot=$((tot+1)); [ -f "$P$f" ] && ok=$((ok+1))
done
echo "amostra: $ok de $tot arquivos existem"
echo "== duracao total aproximada dos audios da loja (amostra de 50) =="
s=0; n=0
for f in $(q "select \"midiaUrl\" from \"Mensagem\" where \"usuarioId\"='$U' and \"fromMe\" and tipo='audio' and coalesce(\"enviadoPorId\",'')<>'bot' and \"midiaUrl\" is not null and timestamp > now() - interval '6 months' order by random() limit 50;"); do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$P$f" 2>/dev/null); [ -n "$d" ] && { s=$(echo "$s + $d" | bc); n=$((n+1)); }
done
echo "media por audio: $(echo "scale=1; $s / ($n+0.0001)" | bc) s em $n arquivos"
ls /root/whatsapp-crm/backend/data/transcricoes 2>/dev/null | wc -l
nproc; free -m | head -2
