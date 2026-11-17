q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
for c in 195348081438763 230429374320873 25602736312503; do
  echo "================ $c"
  q "select to_char(timestamp - interval '3 hours','HH24:MI:SS'), case when \"fromMe\" then coalesce(\"enviadoPorId\",'FONE/EXT') else 'CLIENTE' end, tipo, left(replace(texto,E'\n',' / '),110) from \"Mensagem\" where \"chatJid\" like '$c%' and timestamp > now() - interval '8 hours' order by timestamp;" | tail -40
done
echo "== regra anti_loop_volume =="
grep -n "anti_loop_volume" -B30 /root/whatsapp-crm/backend/src/workers/botAtendimentoService.ts | grep -nE "volume|limite|LIMITE|length|janela|min|>=|>" | head -30
echo "== eco_externo =="
grep -n "eco_externo" -B12 -A3 /root/whatsapp-crm/backend/src/workers/*.ts | head -60
