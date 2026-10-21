// 21/10 (pedido do dono): pneu da promocao -> o robo DESTACA a promocao (na frente do preco) e, se for item do
// "compre 3 e leve 4", ja fala da campanha com o valor de 4 pneus pagando 3.
const fs = require('fs');
const f = process.argv[2] + '/src/data/tabelaPrecos.ts';
let s = fs.readFileSync(f, 'utf8');
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
if (s.includes('destaquePromocao')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };

rep(`    const partes: string[] = [
      \`Temos \${sujeito} *\${item.medida}* da marca *GP Premium* está saindo por *R$ \${valorTotal} à vista*\${complementoTotal}.\`,
      'Se preferir, você pode parcelar em até 10x no cartão!',
    ];
    if (avisoLeve4) partes.push(avisoLeve4);
    const promo = resumoPromocional(item);
    if (promo.length) partes.push(...promo);
    return partes;`,
`    const partes: string[] = [
      ...destaquePromocao(item),
      \`Temos \${sujeito} *\${item.medida}* da marca *GP Premium* está saindo por *R$ \${valorTotal} à vista*\${complementoTotal}.\`,
      'Se preferir, você pode parcelar em até 10x no cartão!',
    ];
    if (avisoLeve4) partes.push(avisoLeve4);
    // Item do leve 4 e o cliente ainda nao pediu 4: mostra quanto ficam os 4 pagando 3 (empurra o pedido maior).
    else if (item.compre3Leve4 && qtd < 4) partes.push(\`Levando 4, você paga só 3: os 4 pneus saem por *R$ \${brl(item.aVista * 3)} à vista*.\`);
    return partes;`);

rep("function resumoPromocional(item: ItemPreco): string[] {",
`// Primeira bolha quando o pneu esta em promocao (vem ANTES do preco, pra chamar a atencao).
function destaquePromocao(item: ItemPreco): string[] {
  if (item.compre3Leve4) return ['🔥 Boa notícia: esse pneu está na promoção *COMPRE 3 E LEVE 4* — levando 4, você paga só 3!'];
  if (item.promocao) return ['🔥 Boa notícia: esse pneu está em *PROMOÇÃO*!'];
  return [];
}

function resumoPromocional(item: ItemPreco): string[] {`);

// parcela especifica de item do leve 4: lembra a campanha
rep("  return [parte1];\n}",
`  return item.compre3Leve4 && qtd < 4
    ? [parte1, 'Lembrando: esse pneu está na promoção *COMPRE 3 E LEVE 4* — levando 4, você paga só 3!']
    : [parte1];
}`);
if (crlf) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(f, s); console.log('ok crlf=' + crlf);
