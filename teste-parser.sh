cd /root/ant-lab
node /root/patch-parser-invoke.js /root/ant-lab
./node_modules/.bin/tsc --noEmit && echo TSC_LAB_OK
a=$(grep -n "^export const LIXO_TECNICO" src/bot-service/server.ts | cut -d: -f1)
b=$(grep -n "^function parsearRespostaBot" src/bot-service/server.ts | cut -d: -f1)
sed -n "$a,$((b+42))p" src/bot-service/server.ts | sed "s/^export const/const/" > src/teste-parser.ts
cat >> src/teste-parser.ts <<'EOF'
type RespostaBotBridge = { partes: string[] };
console.log(JSON.stringify(parsearRespostaBot(`<invoke name="__json__">\n<parameter name="partes">["Desculpa a confusão!", "Segue o link", "Quando você vem?"]</parameter>\n</invoke>`)));
console.log(JSON.stringify(parsearRespostaBot(`{"partes":["oi"]}`)));
console.log(JSON.stringify(parsearRespostaBot(`<invoke name="x"></invoke> lixo`)));
EOF
./node_modules/.bin/ts-node --transpile-only src/teste-parser.ts
rm -f src/teste-parser.ts
