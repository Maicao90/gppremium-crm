# Lab com COPIA do arquivo real da analise (nao toca producao) + copia dos audios citados na pasta FALSA do lab.
LA=/root/aprendizado-lab-api; B=/root/whatsapp-crm/backend
cp /root/josy-analise/aprendizado-josy.json $LA/aprendizado-josy.real.json
cp $LA/aprendizado-josy.real.json $LA/data/cerebro/aprendizado-josy.json
echo '[]' > $LA/data/cerebro/licoes.json; rm -f $LA/public/midias/bot-audios/josy-*.ogg
n=0; f=0
for m in $(node -e 'const j=require("/root/aprendizado-lab-api/aprendizado-josy.real.json");for(const p of j.propostas)for(const a of p.audios||[])console.log(a.midia)' | sort -u); do
  nome=$(basename "$m")
  if [ -f "$B/public/midias/$nome" ]; then cp -n "$B/public/midias/$nome" $LA/public/midias/; n=$((n+1)); else f=$((f+1)); echo "falta: $m"; fi
done
echo "audios copiados pra pasta falsa: $n; faltando no servidor: $f"
du -sh $LA/public/midias
curl -s -o /dev/null -w "GET /api/cerebro/aprendizado -> %{http_code}\n" http://127.0.0.1:3017/api/cerebro/aprendizado
curl -s http://127.0.0.1:3017/api/cerebro/aprendizado | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.contagem, j.existe)})'
