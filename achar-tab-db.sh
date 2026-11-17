q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
echo "== imagens de 21/10 entre 10:05 e 10:20 (Brasilia) =="
q "select to_char(timestamp - interval '3 hours','DD/MM HH24:MI'), \"usuarioId\", \"chatJid\", \"fromMe\", \"midiaUrl\", left(texto,60) from \"Mensagem\" where tipo='imagem' and timestamp between '2026-10-21 13:05' and '2026-10-21 13:20' order by timestamp;"
echo "== leituras de imagem que falam de tabela/TAB =="
grep -ril "TAB\|tabela de pre" /root/whatsapp-crm/backend/data/leituras-imagem 2>/dev/null | head
