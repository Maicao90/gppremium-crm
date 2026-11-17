B=/root/whatsapp-crm/backend
sed -n 905,945p $B/src/workers/botAtendimentoService.ts
q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
for c in 217617503662248 152531619569793; do
  echo "================ $c (pneu fora da tabela)"
  q "select to_char(timestamp - interval '3 hours','HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'FONE/EXT') else 'CLIENTE' end, tipo, left(replace(texto,E'\n',' / '),120) from \"Mensagem\" where \"chatJid\" like '$c%' and timestamp > now() - interval '8 hours' order by timestamp;" | tail -14
done
echo "== pausas automaticas de hoje por motivo (BotConversa) =="
q "select \"motivoPausa\", count(*) from \"BotConversa\" where \"pausadoAte\" > now() group by 1 order by 2 desc;"
echo "== fora_da_lista hoje no log =="
grep -ah "$(date -u +%Y-%m-%d)" /root/whatsapp-crm/logs/app.log /root/whatsapp-crm/logs/error.log | grep -a "fora_da_lista\|fora da lista" | grep -v Vigia | tail -5 | cut -c1-200
