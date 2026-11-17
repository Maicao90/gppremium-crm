require('/root/ant-lab/node_modules/ts-node').register({ transpileOnly: true, project: '/root/ant-lab/tsconfig.json' });
const m = require('/root/ant-lab/src/data/medidaJuntada.ts');
const t = require('/root/ant-lab/src/data/tabelaPrecos.ts');
const lp = ['195/55', '195 55', '195-55', '195.55', '195,55', '195x55', 'pneu 195/55', 'o 195/55?', 'e 195/55?', 'R$ 195,50', 'vi por 195,50', '1.195,50', 'paguei 205,55 la', 'cep 72855-000', 'cep 72.235-500', '61 99195-5512', '(61) 3195-5512', '3195-5512', '61 3601-2020', 'dia 15/10', 'as 12.30', '2x 185/65', '185x65', '205/55 e 195/55', 'gol 2015', '175/70/13', 'tenho 185 anos 65', 'km 195.550', '195.550 km', 'R 195/55'];
console.log('== larguraPerfilDoTexto');
for (const s of lp) console.log(JSON.stringify(s).padEnd(22), '->', m.larguraPerfilDoTexto(s), '| soLP:', m.rajadaSoLarguraPerfil([s]));
const aros = ['aro 16', 'Aro 16', 'ARO 13', 'aro:15', 'aro16', '16', '15.', 'r16', 'R16', 'R 15', 'R$15', 'r$ 15', '2016', '208', 'peugeot 208 2016', '4 pneus aro 16', 'tenho aro 15 mas quero aro 16', 'vi o aro 13, tem aro 16?', 'o aro 13 é esse preço mesmo?', '12', '24', '25', 'em 12x', 'quero 16 pneus', 'quero 4', 'Qual o valor do aro 16', 'carro r 20', 'cr16', 'r16?', 'é R13?', 'são 14 h'];
console.log('== aroDoTexto');
for (const s of aros) console.log(JSON.stringify(s).padEnd(32), '->', m.aroDoTexto(s));
const U = (c) => ({ role: 'user', content: c });
const A = (c) => ({ role: 'assistant', content: c });
const AD = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nOi, Tudo bem ?';
const casos = [
  ['ad13 hist + 195/55', ['195/55'], [U(AD)], 1],
  ['aro em hist antigo > 8', ['195/55'], [U('aro 16'), A('1'), U('2'), A('3'), U('4'), A('5'), U('6'), A('7'), U('8')], 1],
  ['minutos null, hist dias atras', ['195/55'], [U('aro 16')], null],
  ['minutos 300', ['195/55'], [U('aro 16')], 300],
  ['preco no meio', ['195/55'], [U('aro 16'), A('sai por R$ 259,00')], 1],
  ['medida inteira no meio', ['aro 16'], [U('195/55'), U('185/65/15')], 1],
  ['so hist, nada na rajada', ['ok'], [U('195/55'), U('aro 16')], 1],
  ['null content', [null, undefined, '195/55'], [U(null), A(undefined), {}, null, U({ a: 1 })], 1],
  ['ultima vence (lp)', ['205/55'], [U('195/55'), U('aro 16')], 1],
  ['ultima vence (aro)', ['aro 15'], [U('195/55'), U('aro 16')], 1],
  ['mesma msg duas lp', ['tenho 195/55 mas quero 205/55'], [U('aro 16')], 1],
  ['qtd 16', ['16 pneus'], [U('195/55')], 1],
];
console.log('== juntarMedidaRecente');
for (const [n, r, a, min] of casos) { try { console.log(n.padEnd(28), JSON.stringify(m.juntarMedidaRecente(r, a, min))); } catch (e) { console.log(n, 'EXCECAO', e.message); } }
console.log('== arosDaTabela', m.arosDaTabela('195/55'), m.arosDaTabela('175/70'), m.arosDaTabela('999/99'));
console.log('== extrair', JSON.stringify(['195 55 16', '195-55-16', '195/55r16', '19555r16', '195/55 R16', 'oferta do 185/65/ R15 por R$ 199'].map((s) => [s, t.extrairMedidasDoTexto(s)])));
console.log('== tabela 195/55/13?', t.encontrarPrecosExatosPorMedida('195/55/13').length, '195/50/15?', t.encontrarPrecosExatosPorMedida('195/50/15').length, '205/55/16?', t.encontrarPrecosExatosPorMedida('205/55/16').length);
