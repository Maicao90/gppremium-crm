// 23/11 (dono: "a gente tinha que resolver esses erros pra ela ser uma ia perfeita que nunca erra coisa boba").
// Casos reais:
//  (1) 20/11 "📢 [Anúncio] Compre 3, leve 4 / Olá! Posso ter mais informações?" e 18/11 "Vim pelo anúncio e gostaria de mais
//      informações" -> o robo abria com "Os valores do anúncio são à base de troca: 165/70/14 R$189..." (anuncio errado, mensagem
//      longa). A palavra "anúncio" do titulo/da frase padrao disparava o texto. Agora so sai se o cliente falar do PRECO do anuncio.
//  (2) 19/11 "Qual essa numeração do 17?" -> IA livre mandou a LISTA inteira do aro 17. Agora: "Show, aro 17! Qual é o carro?".
//  (3) 20/11 "Pegout 207 / Ano 2011 / Aonde fica a loja de vcs" -> so a localizacao, o carro ficou sem resposta. Agora responde os dois.
//  (+) Virtus na tabela de carros (historico da loja: 205/55/16 e 205/50/17).
// Sem crases nem ${ } nos trechos TS (String.raw).
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 23/11')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 18/11')) { console.error('FALHOU: aplique antes o patch 1711f'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('base de troca so quando o cliente fala do preco do anuncio',
String.raw`  if (CLIENTE_FALA_DE_TROCA.test(textoCliente) && /troca|an[uú]ncio|propaganda/i.test(textoCliente + tudo)) saida.unshift(TEXTO_BASE_TROCA);`,
String.raw`  // CORRECOES 23/11: o titulo do anuncio clicado ("📢 [Anúncio] Compre 3, leve 4") e o "vim pelo anúncio, quero mais informações"
  // nao sao o cliente perguntando do preco do anuncio: ai o robo so pede a medida (dono: "a mensagem esta ficando longa demais").
  const clienteSemTitulo = String(textoCliente || '').replace(/^\s*📢\s*\[An[uú]ncio\][^\n]*$/gim, '');
  const falaDoPrecoDoAnuncio = /base de troca|troca d[oe] (meu )?(pneu )?usado|deixar? (o )?(meu )?(pneu )?usado|\b189\b|\b199\b/i.test(clienteSemTitulo)
    || (/an[uú]ncio|propaganda/i.test(clienteSemTitulo) && /valor|pre[cç]o|R\$|barat|promo|\b189\b|\b199\b|troca/i.test(clienteSemTitulo));
  if (falaDoPrecoDoAnuncio) saida.unshift(TEXTO_BASE_TROCA);`);

troca('funcao: aro perguntado como numeracao',
String.raw`// CORRECOES 18/11 — a resposta cita outra loja`,
String.raw`// CORRECOES 23/11 — "Qual essa numeração do 17?", "quais medidas do aro 15?", "tem pneu 14?": e o ARO (sem carro, sem medida).
// A IA livre mandava a lista inteira do aro; o fluxo pergunta o carro numa frase.
function aroPerguntaNumeracao(rajada: string[]): string | null {
  const t = rajada.map((r) => String(r || '').replace(/^\s*📢\s*\[An[uú]ncio\][^\n]*\n?/i, '')).join('\n').trim();
  if (!t || t.length > 120 || /\d{3}\s*[\/\\ x.\-]?\s*\d{2}/.test(t) || CARROS_BR.test(t)) return null;
  const m = /\b(numera[cç][aã]o|n[uú]mero|medidas?|tamanhos?|op[cç][oõ]es|pneus?)\b[^\n?]{0,25}?\b(?:aro\s*)?(1[2-9]|2[0-2])\b(?!\s*(pneus?|unid|x\b|reais|r\$|mil|km|anos?|h\b|horas?))/i.exec(t);
  return m ? (m[2] as string) : null;
}
// CORRECOES 18/11 — a resposta cita outra loja`);

troca('aro perguntado vai pro "qual e o carro"',
String.raw`      const aroDaRajada = soAro ? soAro[2] : (!temFoto && !temMidiaSemTexto ? aroSemMedidaNaRajada(rajada) : null);`,
String.raw`      const aroDaRajada = soAro ? soAro[2] : (!temFoto && !temMidiaSemTexto ? (aroSemMedidaNaRajada(rajada) || aroPerguntaNumeracao(rajada)) : null);`);

troca('localizacao + carro na mesma mensagem',
String.raw`            if (decisao.chaves.length === 1 && decisao.chaves[0] === 'preco_medida') {`,
String.raw`            // CORRECOES 23/11: "Pegout 207 / Ano 2011 / Aonde fica a loja" recebia so a localizacao — o carro ficava sem resposta.
            if (decisao.chaves.includes('localizacao') && !decisao.chaves.includes('preco_medida') && !dadosUsados.medida && !medidasEscritas.length && !medidaJuntada
              && (CARROS_BR.test(gatilho) || /\b(19[89]\d|20[0-2]\d)\b/.test(gatilho) || /\b(peugeot|pegout|peugeout|pegeot|20[678])\b/i.test(gatilho))) {
              const carroLoc = carroDaRajada(rajada, true);
              const opLoc = carroLoc ? carroLoc.medidas.filter((m) => !!precoDaMedida(m)) : [];
              if (carroLoc && opLoc.length === 1) {
                partesDoFluxo.push('Pro ' + carroLoc.nome + ', a medida mais comum é a *' + opLoc[0] + '*, que sai por *' + precoDaMedida(opLoc[0] as string)?.texto + '*.', 'Confere na lateral do pneu se é essa mesma 😉');
              } else if (carroLoc && opLoc.length > 1) {
                partesDoFluxo.push('Pro ' + carroLoc.nome + ', as medidas mais comuns são:\n' + opLoc.map((m) => '• *' + m + '* — ' + precoDaMedida(m)?.texto).join('\n'), 'Qual é a do seu? A medida fica na lateral do pneu 😉');
              } else {
                partesDoFluxo.push('E pro seu carro, me confirma a medida que tá escrita na lateral do pneu? Aí já te passo o valor certinho 😉');
              }
              console.log('[BotService] localizacao + carro na mesma mensagem — responde os dois' + (carroLoc ? ' (' + carroLoc.nome + ')' : '') + '.');
            }
            if (decisao.chaves.length === 1 && decisao.chaves[0] === 'preco_medida') {`);

if (!/\bvirtus:\s*\{/.test(s)) {
  troca('Virtus na tabela de carros',
String.raw`  peugeot208: { nome: 'Peugeot 208', medidas: ['195/55/16', '185/65/15'] },`,
String.raw`  peugeot208: { nome: 'Peugeot 208', medidas: ['195/55/16', '185/65/15'] },
  virtus: { nome: 'Virtus', medidas: ['205/55/16', '205/50/17'] },`);
}

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error('FALHOU: ancora de "' + t.nome + '" apareceu ' + n + 'x (esperado 1). Nada foi gravado.'); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log('aplicadas ' + trocas.length + ' trocas (23/11) em ' + arq);
