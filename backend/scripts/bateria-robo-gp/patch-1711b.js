// Correcao 17/11b (primeira hora do robo religado, cliente Raimundo 17h19): a IA livre respondeu "Nessa medida, 195/60/16,
// a gente nao tem aqui no momento" — pela regra da loja, pneu que o robo nao acha vai pra atendente (ela vende outra marca);
// o robo nunca diz ao cliente que a loja nao tem. Uso: node patch-1711b.js <server.ts>
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 17/11b')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 17/11')) { console.error('FALHOU: aplique antes o patch-1711.js'); process.exit(1); }
const de = `    res.json({
      partes: partesFinais,
      deterministico: false,`;
const para = `    // CORRECOES 17/11b: a IA livre nunca diz ao cliente que a loja nao tem o pneu/medida — isso e assunto da atendente.
    if (lb && iaLivreRestrita(lb.nome) && iaDisseQueNaoTem(partesFinais)) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] IA livre ia dizer que a loja nao tem a medida/pneu — passa pra atendente.');
      return res.json({ partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], deterministico: true, acaoTipo: 'PASSAR_ATENDENTE', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: assuntosLidos, chaves: ['assunto_atendente'], rajada });
    }
    res.json({
      partes: partesFinais,
      deterministico: false,`;
const de2 = `let nomeAtendenteGuarda = 'Josy';`;
const para2 = `let nomeAtendenteGuarda = 'Josy';
// A bolha nega ter um pneu/medida ("essa medida a gente nao tem", "195/60/16 esta em falta", "nao trabalhamos com aro 19").
function iaDisseQueNaoTem(partes: string[]): boolean {
  const NEGA = /(n[aã]o\\s+(a gente\\s+)?(temos|tem|tenho|trabalhamos|trabalho|vendemos|vendo|fabricamos)|a gente n[aã]o (tem|trabalha|vende)|em falta|acabou|esgotad|sem estoque|fora de estoque|n[aã]o (est[aá] |fica )?dispon[ií]vel|indispon[ií]vel)/i;
  const PNEU = /(medida|\\d{3}\\s*\\/\\s*\\d{2}|aro\\s*\\d{2}|pneu|tamanho)/i;
  // Negacoes que sao fato aprovado da loja e nao falta de pneu: entrega, reserva, loja em outra cidade, outras marcas (texto do fluxo).
  const PERMITIDO = /(entrega|reserva|loja em|filial|outras marcas|frete|envio)/i;
  return (partes || []).some((p) => { const t = String(p || ''); return NEGA.test(t) && PNEU.test(t) && !PERMITIDO.test(t); });
}`;
for (const [nome, a] of [['resposta final da IA livre', de], ['funcao', de2]]) {
  const n = s.split(a).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora "${nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
s = s.replace(de, () => para).replace(de2, () => para2);
fs.writeFileSync(arq, s);
console.log('aplicada a trava 17/11b em ' + arq);
