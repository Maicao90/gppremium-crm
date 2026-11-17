cd /root/gp-aro/conf
echo "==== rodada2 (k1 em diante, compacto)"
sed -n '/\[k2#1\]/,$p' rodada2.txt | grep -E '^# |via=|^  > ' | cut -c1-230
echo "==== anteriores pos-correcao (compacto)"
for f in anterior-pos-1.txt anterior-pos-2.txt; do echo "-- $f"; grep -E '^# |via=' $f | sed 's/assuntos=.*chaves/chaves/' | cut -c1-200; done
echo "==== auditoria (simular:true)"
cat auditoria-pos.txt
echo "==== erros no log do lab"
grep -i -E "error|exce|TypeError" /tmp/lab-bot.log | head
