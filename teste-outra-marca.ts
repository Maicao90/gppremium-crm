import 'dotenv/config';
import { extrairIntencoesPreco } from './data/fluxoPrecoExtrator';
import { chaveDoFluxo } from './services/llmAnthropic';

const ORC = 'ATENDENTE: (foto que a atendente mandou) Orçamento de pneus, medida 185/60/15. Valores à vista: 1. Dunlop FM800 R$ 493,58 2. Goodyear Edge Sport R$ 482,68 3. Comforser CF510 (Chinês) R$ 276,36 4. GP-1 (GP Premium) R$ 249,00';
const casos: Array<[string, string, string]> = [
  ['audio Mauricio (orcamento da atendente)', 'A princípio é 4, mas eu não estou querendo agora. Estou fazendo orçamentos. Quanto é que ficaria o valor do pneu desse comandeiro, e com força é o pneu chinês, né? Dessa medida aí que vocês têm.', `${ORC}\nCLIENTE: Esse conforser está num preço bom.`],
  ['esse conforser (orcamento)', 'Esse conforser está num preço bom', ORC],
  ['e chines? (so robo cotou GP)', 'e chines?', 'ROBO: Temos o pneu 185/60/15 da marca GP Premium por R$ 249,00 à vista.'],
  ['medida com orcamento no contexto', 'qual o valor do 185/60/15?', ORC],
  ['quero o GP do orcamento', 'vou querer o GP de 249 mesmo, 4 unidades', ORC],
];
(async () => {
  const k = chaveDoFluxo() as string;
  for (const [nome, msg, ctx] of casos) {
    const it = await extrairIntencoesPreco([msg], ctx, k);
    console.log(nome.padEnd(42), '->', JSON.stringify(it?.map((i: any) => i.intencao)));
  }
})();
