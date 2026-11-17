cat /root/josy-analise/sintetizar.mjs
echo "=== transcricoes (3 linhas)"; head -n 3 /root/josy-analise/transcricoes.jsonl | cut -c1-600
wc -l /root/josy-analise/transcricoes.jsonl
echo "=== conversas"; ls /root/josy-analise/conversas | head; ls /root/josy-analise/conversas/* | head -5
