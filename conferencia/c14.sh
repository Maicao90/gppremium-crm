cd /root/gp-aro/conf
node /root/gp-aro/teste-aro.js > anterior-pos-b.txt 2>&1
for f in anterior-pos-.txt anterior-pos-b.txt; do
  echo "== $f"
  grep -E '^# |via=|^  > ' $f | sed 's/assuntos=.*chaves/chaves/' | cut -c1-200
done
echo "== erros de execucao no log do lab"
grep -i -E 'TypeError|ReferenceError|Unhandled' /tmp/lab-bot.log | head -5
