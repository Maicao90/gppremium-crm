T=/root/josy-analise/transcricoes.jsonl
for k in "remold" "garantia" "60 mil" "dez vezes\|10 vezes\|10x" "localiza\|endereço" "recauchut" "balanceamento" "chinês\|chines" "dinheiro" "horário\|abre\|fecha"; do
  echo "=== $k"; grep -i "$k" $T | awk 'length($0) < 420' | head -n 6
done
echo "=== jwt.sign no backend"; grep -rn "jwt.sign(" /root/whatsapp-crm/backend/src --include=*.ts | head -5
echo "=== resultados ja existem?"; ls -la /root/josy-analise/resultados.jsonl /root/josy-analise/aprendizado-josy.json 2>&1
echo "=== fluxoCatalogo imports"; grep -n "^import" /root/whatsapp-crm/backend/src/data/fluxoCatalogo.ts /root/whatsapp-crm/backend/src/services/llmAnthropic.ts
echo "=== tamanho src backend"; du -sh /root/whatsapp-crm/backend/src; ls /root/whatsapp-crm/backend
