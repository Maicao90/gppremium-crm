// Copia fiel da quebrarEmBolhas (botAtendimentoService.ts) pra testar sem subir o servidor.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ini = src.indexOf('export function quebrarEmBolhas');
const fim = src.indexOf('\nasync function enviarEmBolhas');
const corpo = src.slice(ini, fim).replace('export function quebrarEmBolhas(texto: string): string[]', 'function quebrarEmBolhas(texto)').replace(/: string\[\]/g, '').replace(/let atual = ''/, "let atual = ''");
const quebrarEmBolhas = new Function(corpo + '\nreturn quebrarEmBolhas;')();
const casos = [
  'Vou ser sincero com você: sim, é remold — mas não é um remold comum. O GP Premium é feito com borracha padrão europeu e passa por controle rígido de qualidade. A gente dá garantia de 2 anos e 60 mil km ou seu dinheiro de volta. Muitos clientes já aprovaram esse modelo.',
  'Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: 255/35/18: R$ 649,00 à vista; 265/35/18: R$ 1.180,00 à vista; 225/55/18: R$ 399,00 à vista. Alguma dessas serve pra você?',
  'Temos os 4 pneus *215/55/17* da marca *GP Premium* saem por *R$ 1.184,70 à vista* (valor total).',
  'Oi, tudo bem?',
];
for (const c of casos) { console.log(`(${c.length} letras)`); quebrarEmBolhas(c).forEach((b) => console.log('   > ' + b)); console.log(); }
