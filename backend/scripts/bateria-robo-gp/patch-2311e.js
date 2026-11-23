// 23/11e — o CONFERENTE agora le TODOS os ensinamentos do Cerebro (inclusive os 49 do tipo "orientar", que a IA livre ignorava).
// Dono: "parece ate que o cerebro dele nao funciona, ele sabe o que fazer e ainda faz errado".
// Antes o conferente so via os ensinamentos com texto pronto (responder/atendente/silencio). Agora ele confere cada resposta
// contra todos: se a ultima mensagem do cliente cai na situacao de um ensinamento e a resposta o contraria, ele corrige.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11e')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 23/11c')) { console.error('FALHOU: aplique antes o patch 2311c'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('conferente le tambem os ensinamentos "orientar"',
String.raw`    licoes = licoesAtivasDaLoja(lojaNome).filter((l: any) => l.acao !== 'orientar')
      .map((l: any) => '- ' + String(l.situacao || '').slice(0, 200) + ' -> ' + (l.acao === 'responder' ? 'responder: "' + limpa(l.resposta).slice(0, 240) + '"' : l.acao))
      .join('\n');`,
String.raw`    // CORRECOES 23/11e: TODOS os ensinamentos (responder, orientar, atendente, silencio) — o Cerebro passa a valer em toda resposta.
    licoes = licoesAtivasDaLoja(lojaNome)
      .map((l: any) => '- QUANDO ' + String(l.situacao || '').slice(0, 220) + ' -> ' + (l.acao === 'responder' ? 'RESPONDER: "' + limpa(l.resposta).slice(0, 260) + '"' : l.acao === 'orientar' ? 'ORIENTACAO: ' + limpa(l.resposta).slice(0, 420) : l.acao === 'atendente' ? 'PASSAR PRA ATENDENTE' : 'FICAR EM SILENCIO'))
      .join('\n');`);

troca('regra do cerebro no pedido do conferente',
String.raw`'\n\nENSINAMENTOS DO DONO (situacao -> o que fazer):\n'`,
String.raw`'\n\nENSINAMENTOS DO DONO — REGRA DE OURO: se a ULTIMA mensagem do cliente cai na situacao de um ensinamento, a resposta TEM que seguir o que o dono mandou (RESPONDER = esse texto; ORIENTACAO = seguir a orientacao; PASSAR PRA ATENDENTE; FICAR EM SILENCIO). Resposta que contraria um ensinamento e erro: veredito "corrigir" (ou "atendente"/"silencio" se o ensinamento manda). Se nenhum ensinamento se aplica, ignore esta lista.\n'`);

troca('padrao aprovado: conferente nao reescreve cotacao por estilo',
String.raw`  'NAO corrija estilo nem redacao: se a informacao esta certa e responde o cliente, o veredito e "ok". So corrija os erros da lista acima.',`,
String.raw`  'NAO corrija estilo nem redacao: se a informacao esta certa e responde o cliente, o veredito e "ok". So corrija os erros da lista acima.',
  'PADRAO APROVADO (nunca e erro, nao corrija por causa disso): a cotacao padrao do robo ("🔥 Boa notícia: esse pneu está em PROMOÇÃO!", "Temos o pneu X da marca GP Premium está saindo por R$ ...", "Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉"), preco dado direto sem cumprimento, e a resposta que ja traz o preco que o cliente pediu.',
  'TOTAIS: NUNCA mude nem recalcule o total/preco de uma cotacao que a resposta ja traz (o codigo calcula certo, inclusive o compre 3 leve 4, que so vale onde a TABELA marca [COMPRE 3 LEVE 4]; [PROMOCAO] sozinho e so preco promocional, NAO e compre 3 leve 4). So ACRESCENTE o valor da parcela, quando o cliente perguntou, a partir da tabela.',`);

troca('trava de codigo: correcao nao pode perder o preco da cotacao',
String.raw`      const precoRuim = novas.length ? precosForaDaTabela(novas, textosCliente).filter((v) => !valoresOriginais.has(v)) : [];`,
String.raw`      const precoRuim = novas.length ? precosForaDaTabela(novas, textosCliente).filter((v) => !valoresOriginais.has(v)) : [];
      // CORRECOES 23/11e: cotacao do fluxo (preco_medida) tem o total calculado em codigo — a correcao nao pode trocar nem tirar esse valor.
      const valoresNovos = new Set(valoresEmReais(novas.join('\n')));
      const perdeuValor = chaves0.includes('preco_medida') && Array.from(valoresOriginais).some((v) => !valoresNovos.has(v));`);

troca('perdeuValor recusa a correcao',
String.raw`if (!novas.length || precoRuim.length || iaIndicouOutraLoja(`,
String.raw`if (!novas.length || precoRuim.length || perdeuValor || iaIndicouOutraLoja(`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11e cerebro completo) em ' + arq);
