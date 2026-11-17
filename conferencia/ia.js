// Chama SO a leitura da IA (extrairIntencoesPreco) do lab, sem o servidor — pra ver o que a IA devolve crua.
require('/root/ant-lab/node_modules/ts-node').register({ transpileOnly: true, project: '/root/ant-lab/tsconfig.json' });
const ex = require('/root/ant-lab/src/data/fluxoPrecoExtrator.ts');
const { chaveDoFluxo } = require('/root/ant-lab/src/services/llmAnthropic.ts');
const casos = [
  [['Olá! Quero aproveitar a oferta do 185/65/ R15 por R$ 199', '195/55'], ''],
  [['195/55'], ''],
  [['peugeot 208 2016', 'aro 16'], ''],
];
(async () => {
  for (const [r, ctx] of casos) for (let k = 0; k < 3; k++) {
    const x = await ex.extrairIntencoesPreco(r, ctx, chaveDoFluxo());
    console.log(JSON.stringify(r), '->', JSON.stringify(x && x.map((i) => [i.intencao, i.medidaExtraida])));
  }
})();
