cd /root/josy-analise
for i in $(seq 1 180); do
  s=$(node analisar.mjs status)
  echo "$(date -u +%H:%M) $s"
  case "$s" in ended*) break;; esac
  sleep 120
done
node analisar.mjs baixar
wc -l resultados.jsonl
