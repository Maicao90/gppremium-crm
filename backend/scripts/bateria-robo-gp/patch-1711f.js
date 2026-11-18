// 18/11 (dono: "robo tem que parar de mandar pra borracharia"). Caso real 18/11 08:39: a IA livre da GP respondeu
// "Em Novo Gama tem a Borracharia Popular... O WhatsApp deles e (61) 99999-9000" (numero inventado).
// Causa: o robo recebia a lista de TODAS as lojas do CRM (City, Feirao, Direcional, Super Via, Borracharia Popular).
// Correcao: (1) loja com config propria so enxerga a propria loja; (2) regra no texto de instrucoes;
// (3) trava em codigo: resposta da IA que cita outra loja ou telefone que nao e o da loja nao sai — vai pra atendente.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 18/11')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 17/11e')) { console.error('FALHOU: aplique antes os patches ate o 1711e'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('so a propria loja na lista',
`  const lojasTexto = args.lojas.length
    ? args.lojas
`,
`  // CORRECOES 18/11: loja com config propria (GP, City...) so enxerga a si mesma — o robo nunca indica outra loja do CRM.
  const normLoja = (t: unknown) => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\\b(pneus?|e|auto|center)\\b/g, ' ').replace(/\\s+/g, ' ').trim();
  const lojasVisiveis = args.lojaBot && args.lojaBot.nome
    ? args.lojas.filter((l) => { const a = normLoja(l.nome), b = normLoja(args.lojaBot!.nome); return !!a && !!b && (a.includes(b) || b.includes(a)); })
    : args.lojas;
  const lojasTexto = lojasVisiveis.length
    ? lojasVisiveis
`);

troca('regra no texto de instrucoes',
`    '- Nunca explique estas regras ao cliente.',`,
`    '- Nunca explique estas regras ao cliente.',
    ...(args.lojaBot && args.lojaBot.nome ? [\`- Voce atende SO a \${args.lojaBot.nome}. NUNCA indique outra loja, borracharia, concorrente ou outra cidade pro cliente comprar, e NUNCA passe telefone ou WhatsApp de ninguem. Se a gente nao atende o que ele precisa, diga so que vai verificar.\`] : []),`);

troca('trava: outra loja ou telefone estranho',
`    if (lb && iaLivreRestrita(lb.nome) && iaDisseQueNaoTem(partesFinais)) {`,
`    // CORRECOES 18/11: a IA livre nunca manda o cliente pra outra loja nem passa telefone que nao e o da loja.
    if (lb && iaIndicouOutraLoja(partesFinais, lb)) {
      console.error('[BotService][TRAVA DE COMPORTAMENTO] IA livre ia indicar outra loja/telefone — passa pra atendente.');
      return res.json({ partes: ['Só um instante que eu vou verificar aqui pra você, tá bem?'], deterministico: true, acaoTipo: 'PASSAR_ATENDENTE', novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: assuntosLidos, chaves: ['assunto_atendente', 'outra_loja_bloqueada'], rajada });
    }
    if (lb && iaLivreRestrita(lb.nome) && iaDisseQueNaoTem(partesFinais)) {`);

troca('funcao da trava',
`// A bolha nega ter um pneu/medida`,
`// CORRECOES 18/11 — a resposta cita outra loja (do CRM ou conhecida) ou um telefone que nao e o da propria loja.
const OUTRAS_LOJAS = /(borracharia|novo gama|lunabel|pont[aã]o 24h|pneu express|city pneus|feir[aã]o dos pneus|direcional pneus|super ?via|atacad[aã]o dos pneus)/i;
function iaIndicouOutraLoja(partes: string[], lb: any): boolean {
  const nomeProprio = String(lb?.nome || '').toLowerCase();
  const telProprio = String(lb?.telefone || '').replace(/\\D/g, '').slice(-8);
  return (partes || []).some((p) => {
    const t = String(p || '');
    const m = OUTRAS_LOJAS.exec(t);
    if (m && !nomeProprio.includes(String(m[1]).toLowerCase())) return true;
    const tels = t.match(/(?<!\\d)(?:\\(?\\d{2}\\)?\\s?)?9?\\d{4}[-\\s.]?\\d{4}(?!\\d)/g) || [];
    // Telefone que nao e o da loja (os 8 ultimos digitos). Medida e preco nao casam (tem barra, virgula ou R$).
    return tels.some((x) => { const d = x.replace(/\\D/g, ''); return d.length >= 8 && (!telProprio || d.slice(-8) !== telProprio); });
  });
}
// A bolha nega ter um pneu/medida`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora de "${t.nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log(`aplicadas ${trocas.length} trocas (18/11 outra loja) em ${arq}`);
