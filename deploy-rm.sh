set -e
B=/root/whatsapp-crm/backend
LOG=/root/whatsapp-crm/logs/app.log
ts=$(date +%s)
ARQS="src/data/fluxoPreco.ts src/data/fluxoPrecoExtrator.ts src/data/fluxoCatalogo.ts src/services/botLojas.ts src/workers/botAtendimentoService.ts src/workers/whatsappService.ts"
cd $B && tar -cf /root/backup-rm-$ts.tar $ARQS data/bot-lojas.json
cd /root/ant-lab && cp --parents $ARQS $B/
cd $B && ./node_modules/.bin/tsc --noEmit && echo TSC_PROD_OK
# config: remarketing na GP; City (robo ainda desligado): assuntos que a equipe assume
node -e '
const fs=require("fs");const f="data/bot-lojas.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));
const GP="72213a6c-31c5-410d-a6b4-504dfd223e2f", CITY="cb13ea54-9df1-44bf-9e12-b59bb46167d4";
j[GP].REMARKETING={ativo:true,mensagem:"🙋🏼‍♀️",horasSemResposta:3,maxDias:2,horaInicio:"08:00",horaFim:"19:00",maxPorHora:12};
j[CITY].CHAVES_ATENDENTE=["outra_marca","servico_oficina","alinhamento","balanceamento","balanceamento_quantidade"];
j[CITY].REMARKETING={ativo:true,mensagem:"🙋🏼‍♀️",horasSemResposta:3,maxDias:2,horaInicio:"08:00",horaFim:"19:00",maxPorHora:12};
fs.writeFileSync(f+".tmp",JSON.stringify(j,null,2));fs.renameSync(f+".tmp",f);console.log("bot-lojas ok");'
# textos proprios da City (oficina)
U=$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"' | sed 's#^postgresql://##; s#^postgres://##')
q() { docker exec gp-postgres-crm psql -U "${U%%:*}" -d testdb -At -c "$1"; }
C=cb13ea54-9df1-44bf-9e12-b59bb46167d4
q "insert into \"FluxoResposta\" (chave, partes, \"atualizadoPor\", \"atualizadoEm\") values
 ('loja:$C:condicao', '[\"Temos pneu novo da GP Premium e também pneu meia-vida a partir de R\$ 90 a unidade.\",\"O meia-vida você escolhe aqui na loja, pra ver o estado de cada um. Qual você prefere?\"]', 'claude-21-10', now()),
 ('loja:$C:base_troca', '[\"Aceitamos sim! Seu pneu usado entra como base de troca, sujeito a avaliação aqui na loja. Traz ele que a gente avalia na hora.\"]', 'claude-21-10', now()),
 ('loja:$C:compra_usado', '[\"A gente não compra pneu usado à parte, mas ele pode entrar como base de troca na compra de um pneu, sujeito a avaliação aqui na loja.\"]', 'claude-21-10', now()),
 ('loja:$C:servico_oficina', '[\"Só um instante que eu vou verificar aqui pra você, tá bem?\"]', 'claude-21-10', now())
 on conflict (chave) do update set partes=excluded.partes, \"atualizadoEm\"=now()"
echo "textos City ok"
linhas=$(wc -l < $LOG)
PORT=3001 pm2 reload whatsapp-crm --update-env >/dev/null
echo "reload whatsapp-crm $(date -u +%H:%M:%S)"
for i in $(seq 1 12); do
  sleep 5
  abertas=$(tail -n +$linhas $LOG | grep -ac "Conexão aberta com sucesso" || true)
  echo "tentativa $i: conexoes abertas=$abertas"
  if [ "$abertas" -ge 10 ]; then break; fi
done
pm2 reload bot-service --update-env >/dev/null
for i in $(seq 1 12); do c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3010/health); [ "$c" = 200 ] && break; sleep 3; done
echo "bot-service $c"
curl -s -o /dev/null -w "health crm: %{http_code}\n" --max-time 10 https://crm.nailacademyprofissional.com/api/health
cd /root/whatsapp-crm && git add backend/src/data/fluxoPreco.ts backend/src/data/fluxoPrecoExtrator.ts backend/src/data/fluxoCatalogo.ts backend/src/services/botLojas.ts backend/src/workers/botAtendimentoService.ts backend/src/workers/whatsappService.ts && git -c user.name=Maicon -c user.email=maiconbatn5@gmail.com commit -q -m "Robo: remarketing com o emoji (cliente quieto ha 3h, 1x por silencio, 12/h), servico de oficina (CAT_AD), assuntos que a equipe assume por loja (City)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log -1 --format="%h %s" | cut -c1-80
echo "linha_log_inicio=$linhas"
