L=/root/ant-lab
grep -n -A25 "model BotConversa" $L/prisma/schema.prisma
echo ----
grep -n "agendarRespostaBotIA\|pausarConversaBotIA\|motivoPausa\|pausadoAte" $L/src/workers/whatsappService.ts | head -60
echo ----
grep -rn "motivoPausa\|'fora_da_lista'\|fora_da_lista" $L/src --include=*.ts | grep -v "\.bak" | grep -v botAtendimentoService | head -40
echo ----
grep -n "^export" $L/src/data/tabelaPrecos.ts $L/src/data/medidaJuntada.ts $L/src/data/fluxoPrecoExtrator.ts
