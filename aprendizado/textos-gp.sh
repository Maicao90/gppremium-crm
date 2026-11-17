set -e
B=/root/whatsapp-crm/backend
# audios da Josy no mesmo formato dos outros do robo (libopus 32k / 48 kHz / mono, sem metadados)
mkdir -p /root/bot-audios-josy-originais
for f in $B/public/midias/bot-audios/josy-*.ogg; do
  n=$(basename $f)
  [ -f /root/bot-audios-josy-originais/$n ] || cp $f /root/bot-audios-josy-originais/$n
  ffmpeg -hide_banner -loglevel error -y -i /root/bot-audios-josy-originais/$n -vn -map_metadata -1 -c:a libopus -b:a 32k -ar 48000 -ac 1 -f ogg $f.novo && mv $f.novo $f
  echo "$n $(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)s"
done
# textos da GP no jeito da Josy (so as situacoes que o fluxo fixo ja cobre; preco continua da TAB.7)
cat > /root/textos-gp-josy.json <<'JSON'
{
  "saudacao": ["Oiê, tudo bem? 😊"],
  "pedir_medida": ["Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro que eu vejo pra você 😉"],
  "pedir_medida_repetida": ["Sem problema! Me diz qual é o seu carro (modelo e ano) que eu vejo a medida certinha e já te passo o valor 😉"],
  "localizacao": ["Somos a fábrica GP Premium, aqui em Luziânia-GO 😊 Tem uma placa bem grandona na frente, não tem erro!", "Segue a nossa localização:"],
  "remold": ["Sim, o GP Premium é remold, mas é linha Premium: um pneu ecológico que nós mesmos fabricamos, com borracha padrão europeu e controle de qualidade. Não tem nada a ver com os remolds convencionais 😉", "Por isso é o pneu mais vendido aqui da loja, com garantia de 2 anos e 60 mil km ou seu dinheiro de volta."],
  "visita_confirmada": ["Combinado! Será uma satisfação receber você aqui 😊 Fica anotado: te espero {DIA}.", "Quer que eu deixe os pneus separadinhos pra você?"]
}
JSON
cat > /tmp/validar-textos.ts <<'TS'
import fs from 'fs';
import { validarTextoFluxo } from '/root/whatsapp-crm/backend/src/data/fluxoCatalogo';
const t = JSON.parse(fs.readFileSync('/root/textos-gp-josy.json', 'utf8'));
let ok = true;
for (const [k, v] of Object.entries(t)) { const p = validarTextoFluxo(k, v); if (p.length) { ok = false; console.log('PROBLEMA', k, p); } else console.log('ok', k); }
if (!ok) process.exit(1);
TS
cd $B && ./node_modules/.bin/ts-node --transpile-only /tmp/validar-textos.ts
q() { docker exec -i gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
q "select chave, partes from \"FluxoResposta\" where chave like 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:%';" > /root/fluxoresposta-gp-antes-josy.txt
node -e '
const t=require("/root/textos-gp-josy.json");const L="loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:";
const esc=(s)=>s.replace(/'"'"'/g,"'"'"''"'"'");
let sql="";for(const[k,v] of Object.entries(t)){const j=esc(JSON.stringify(v));sql+=`insert into "FluxoResposta" (chave, partes, "atualizadoEm", "atualizadoPor") values ('"'"'${L}${k}'"'"', '"'"'${j}'"'"', now(), '"'"'Josy (aprovado pelo dono 22/10)'"'"') on conflict (chave) do update set partes=excluded.partes, "atualizadoEm"=now(), "atualizadoPor"=excluded."atualizadoPor";\n`;}
require("fs").writeFileSync("/root/textos-gp-josy.sql",sql);'
docker exec -i gp-postgres-crm psql -U postgres -d testdb < /root/textos-gp-josy.sql
q "select replace(chave,'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:',''), left(partes::text,90) from \"FluxoResposta\" where chave like 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:%' order by 1;"
