cd /root/ant-lab
grep -n "acaoTipo\|PEDIR_CARRO\|PEDIR_MEDIDA" src/workers/botAtendimentoService.ts src/routes/*.ts | head -20
grep -n "export function textoProprio\|normalizarTextoMedida" src/data/*.ts | head
cat tsconfig.json | head -30
ls node_modules/.bin/tsc
