// Verificacao standalone do fix de 15/09 (Stephanie, medida 265/70/16): quando a
// medida tem mais de um modelo/preco na tabela e o cliente nunca descreveu uso/carro,
// montarRespostaDeterministicaPreco agora devolve um padrao (partesPadraoAmbiguo)
// usando o PRIMEIRO item da tabela pra medida (ADVENTURE ATR, R$559,00), em vez de
// devolver null e deixar a IA escolher sozinha (o que a levou a escolher o modelo mais
// barato, ADVENTURE H/T, R$549,00, corrigido na hora pela funcionaria Josy no chat real).
//
// Roda com: npx ts-node --transpile-only src/data/tabelaPrecos.priceDefault.manual-test.ts
import {
  montarRespostaDeterministicaPreco,
  encontrarPrecosExatosPorMedida,
} from './tabelaPrecos';

let erros = 0;
function checar(nome: string, ok: boolean, detalhe?: string) {
  if (!ok) erros++;
  console.log((ok ? 'OK   ' : 'ERRO ') + nome + (detalhe ? ' -> ' + detalhe : ''));
}

// --- Caso 1: medida AMBIGUA (265/70/16), mensagem real da Stephanie, sem uso/carro descrito ---
const textoStephanie = 'Aro 16 265x70 R Queria 4 pneu desse, qual valor ?';
const itensAmbiguos = encontrarPrecosExatosPorMedida('265/70/16');
console.log('\n265/70/16 itens na tabela (ordem): ' + itensAmbiguos.map((i) => `${i.modelo}=${i.aVista}`).join(' | '));

const r1 = montarRespostaDeterministicaPreco(textoStephanie, textoStephanie);
console.log('\nCaso 1 (Stephanie / 265-70-16) resultado bruto:');
console.log(JSON.stringify(r1, null, 2));

checar('Caso 1: resultado nao é null', r1 !== null);
checar('Caso 1: partesPadraoAmbiguo nao vazio', !!r1 && r1.partesPadraoAmbiguo.length > 0);
checar('Caso 1: partes (exata) fica vazio (medida so tem match ambiguo)', !!r1 && r1.partes.length === 0);
checar('Caso 1: usouTabela === false (nao é match exato)', !!r1 && r1.usouTabela === false);

const textoPadrao1 = (r1?.partesPadraoAmbiguo || []).join(' | ');
// O primeiro item da tabela pra essa medida e o ADVENTURE ATR (559.00). O preco final no
// texto pode vir como total (qtd detectada=4) em vez de unitario — confere os dois jeitos
// pra nao dar falso negativo por causa da multiplicacao de quantidade.
const itemPadrao = itensAmbiguos[0];
checar('Caso 1: primeiro item da tabela é o ADVENTURE ATR (559.00)', !!itemPadrao && itemPadrao.modelo === 'ADVENTURE ATR' && itemPadrao.aVista === 559.00);
const totalEsperadoATR = (559.00 * 4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const totalEsperadoHT = (549.00 * 4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const contemUnitarioATR = textoPadrao1.includes('559,00');
const contemTotalATR = textoPadrao1.includes(totalEsperadoATR);
checar(
  'Caso 1: texto cita o valor do ATR (559,00 unitario ou ' + totalEsperadoATR + ' total), NAO o do H/T',
  (contemUnitarioATR || contemTotalATR) && !textoPadrao1.includes('549,00') && !textoPadrao1.includes(totalEsperadoHT),
  textoPadrao1
);

// --- Caso 2: medida com UM SO match exato (165/70/13) ---
const itensUnicos = encontrarPrecosExatosPorMedida('165/70/13');
checar('Caso 2: 165/70/13 tem exatamente 1 item na tabela (pre-condicao do teste)', itensUnicos.length === 1, JSON.stringify(itensUnicos.map((i) => i.modelo)));

const textoUnico = 'Quanto ta o pneu 165/70/13?';
const r2 = montarRespostaDeterministicaPreco(textoUnico, textoUnico);
console.log('\nCaso 2 (medida com 1 so match / 165-70-13) resultado bruto:');
console.log(JSON.stringify(r2, null, 2));

checar('Caso 2: resultado nao é null', r2 !== null);
checar('Caso 2: partes (exata) nao vazio — comportamento existente preservado', !!r2 && r2.partes.length > 0);
checar('Caso 2: partesPadraoAmbiguo fica vazio (nao é ambiguo)', !!r2 && r2.partesPadraoAmbiguo.length === 0);
checar('Caso 2: usouTabela === true (match exato e certo)', !!r2 && r2.usouTabela === true);

console.log(erros === 0 ? '\nTODOS OK' : '\n' + erros + ' ERRO(S)');
process.exit(erros === 0 ? 0 : 1);
