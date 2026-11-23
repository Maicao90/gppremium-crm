// 23/11f — a cotacao nao fala de montagem por conta propria (ensinamentos Lmvtv5the164 e Lmvtv5vqk5hs do dono: "so fale de servico
// se o cliente perguntar"). Dono 23/11: "sim" (tirar a frase). Quando o cliente PERGUNTA da montagem, a resposta continua (B7).
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11f')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11e')) { console.error('FALHOU: aplique antes o patch 2311e'); process.exit(1); }
const FRASE = 'Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉';
const NOVA = 'Quantos pneus você vai precisar?';
const n = s.split(FRASE).length - 1;
if (n !== 4) { console.error('FALHOU: a frase aparece ' + n + 'x (esperado 4: 3 cotacoes + a instrucao do conferente). Nada foi gravado.'); process.exit(1); }
const ANC = "'TOTAIS: NUNCA mude";
if (s.split(ANC).length - 1 !== 1) { console.error('FALHOU: ancora do conferente'); process.exit(1); }
s = s.split(FRASE).join(NOVA);
s = s.replace(ANC, () => "'MONTAGEM (CORRECOES 23/11f): so se fala de montagem/servico quando o cliente pergunta. Cotacao que oferece a montagem sem ele perguntar contraria o dono: corrija tirando so essa frase.',\n  " + ANC);
fs.writeFileSync(arq, s);
console.log('aplicado: frase da montagem tirada de 3 cotacoes (23/11f)');
