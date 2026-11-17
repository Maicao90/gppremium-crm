cd /root/ant-lab
echo "== manual-test diff (ignorando CR e espacos)"
diff --strip-trailing-cr -w /root/whatsapp-crm/backend/src/data/fluxoPrecoExtrator.manual-test.ts src/data/fluxoPrecoExtrator.manual-test.ts | head -20
file /root/whatsapp-crm/backend/src/data/fluxoPrecoExtrator.manual-test.ts src/data/fluxoPrecoExtrator.manual-test.ts
echo "== tabela/loja usage in server.ts"
grep -n -e "TABELA" -e "encontrarPrecos" -e "lojaBot?.nome" -e "tabelaDaLoja" -e "precosDaLoja" -e "lojaId" src/bot-service/server.ts | head -40
echo "== medidas na tabela que NAO sao NNN/NN/NN"
node -e "
require('ts-node').register({transpileOnly:true});
const t=require('/root/ant-lab/src/data/tabelaPrecos.ts');
const all=t.TABELA_PRECOS_GP.map(i=>String(i.medida));
console.log('total',all.length);
console.log('fora do padrao:', [...new Set(all.filter(m=>!/^\d{3}\/\d{2}\/\d{2}$/.test(m)))]);
console.log('exports', Object.keys(t).join(','));
"
echo "== extrator: intencoes e formato da medida"
grep -n -e "medidaExtraida" -e "intencao ==" -e "'[A-Z_]\{6,\}'" src/data/fluxoPrecoExtrator.ts | head -80
