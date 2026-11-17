E=/root/whatsapp-crm/logs/bot-service-error.log
echo "== erros do bot-service por tipo (ultimos 3 dias) =="
grep -a "Erro em /gerar-resposta" $E | grep -aE "$(date -u +%Y-%m-%d)|$(date -u -d '-1 day' +%Y-%m-%d)|$(date -u -d '-2 day' +%Y-%m-%d)" | sed -E 's/^([0-9-]+) .*Erro em \/gerar-resposta: /\1 /; s/messages\.[0-9]+\.content\.[0-9]+/messages.N.content.N/' | cut -c1-120 | sort | uniq -c | sort -rn | head
echo "== o que o worker fez quando deu erro =="
grep -a "bot-service 500\|Erro em" /root/whatsapp-crm/logs/error.log | grep -a "$(date -u +%Y-%m-%d)" | cut -c1-200 | tail -6
cd /root/whatsapp-crm/backend/src/bot-service
echo "== onde monta a chamada da IA livre =="
grep -n "prefill\|role: 'assistant'\|media_type\|image/jpeg\|mimetype\|mediaType" server.ts | head -30
