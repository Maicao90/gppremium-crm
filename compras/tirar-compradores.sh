q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
# numeros com sinal de compra (loja pediu avaliacao, falou de nota/comprovante; cliente disse que chegou/comprou/pagou)
q "create temp table x as select 1;" >/dev/null
q "select distinct regexp_replace(coalesce(\"numeroReal\", split_part(\"chatJid\",'@',1)),'\D','','g') from \"Mensagem\" where \"usuarioId\"='$J' and ((\"fromMe\" and texto ~* '(avalia|nota fiscal|comprovante)') or (not \"fromMe\" and texto ~* '(cheguei|t[oô] a[ií] na loja|estou a[ií]|j[aá] estou na loja|comprei (a[ií]|com voc)|j[aá] comprei com voc|paguei|fiz o pix|segue o comprovante)'));" | grep -E '^55[0-9]{10,11}$' > /root/compradores-sinal.txt
echo "numeros com sinal de compra: $(wc -l < /root/compradores-sinal.txt)"
lista=$(sed "s/.*/'&'/" /root/compradores-sinal.txt | paste -sd,)
[ -n "$lista" ] && q "update \"Agendamento\" set status='cancelado', \"atualizadoEm\"=now(), observacoes = observacoes || ' | cancelado: sinal de compra' where observacoes like 'robo-recuperacao 22/10%' and status='pendente' and numero in ($lista);"
q "select status, count(*) from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%' group by 1;"
