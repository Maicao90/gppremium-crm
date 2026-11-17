cd /root/whatsapp-crm
echo "== mensagens de pausa no log hoje (resumo por motivo) =="
grep -ah "$(date -u +%Y-%m-%d)" logs/app.log logs/error.log | grep -aiE "paus|humano assumiu|assumiu|trava|anti.?loop|sem_alternativa" | sed -E 's/[0-9]{6,}@(lid|s\.whatsapp\.net)/<chat>/g; s/^[^[]*//' | cut -c1-140 | sort | uniq -c | sort -rn | head -25
echo
echo "== ultimas 25 linhas de pausa com horario =="
grep -ah "$(date -u +%Y-%m-%d)" logs/app.log logs/error.log | grep -aiE "paus|assumiu|trava|anti.?loop" | tail -25 | cut -c1-220
echo
echo "== codigo: onde o worker pausa sozinho =="
grep -n "pausadoAte\|pausarConversaBotIA\|HUMANO_ASSUMIU\|pausaSemEncurtar" backend/src/workers/botAtendimentoService.ts | head -40
