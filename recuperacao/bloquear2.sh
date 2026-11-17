set -e
q() { docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "$1"; }
J=34268c16-7bed-400a-bf1e-a3d9e37d8774
A=/root/whatsapp-crm/backend/data/bot-nao-atender.json
cp $A $A.bak-$(date +%s)
node -e '
const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,"utf8"));
j.numeros=j.numeros||[];
const add=[["556181738551","Helio — Josy: nunca respondeu, não compensa contato (23/10)"],["556198351158","Vander BALI — dono: não mandar mais mensagem (23/10)"]];
for(const [n,obs] of add){ if(!j.numeros.some(x=>String(x.numero||x).replace(/\D/g,"")===n)) j.numeros.push(typeof j.numeros[0]==="string"?n:{numero:n,obs}); }
fs.writeFileSync(f,JSON.stringify(j,null,2));console.log("nao-atender:",j.numeros.length);
' $A
echo "cancelando pendentes desses 2 numeros:"
q "update \"Agendamento\" set status='cancelado', \"atualizadoEm\"=now(), observacoes=coalesce(observacoes,'')||' | cancelado: dono pediu nao mandar mais' where status='pendente' and numero in ('556181738551','556198351158');"
echo "cancelando retomada de quem a loja ja encerrou o atendimento:"
q "with ult as (select distinct on (\"chatJid\") \"chatJid\", \"numeroReal\", texto from \"Mensagem\" where \"usuarioId\"='$J' and \"fromMe\" and coalesce(\"enviadoPorId\",'')<>'bot' and texto <> '' order by \"chatJid\", timestamp desc)
update \"Agendamento\" a set status='cancelado', \"atualizadoEm\"=now(), observacoes=a.observacoes||' | cancelado: loja ja encerrou o atendimento' from ult u where a.numero = regexp_replace(u.\"numeroReal\",'\D','','g') and a.observacoes like 'robo-recuperacao 22/10%' and a.status='pendente' and u.texto ~* 'encerr';"
q "select status, count(*) from \"Agendamento\" where observacoes like 'robo-recuperacao 22/10%' group by 1;"
