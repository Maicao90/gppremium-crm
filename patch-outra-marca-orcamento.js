// 21/10 (dono): o robo vende so GP; outra marca = a atendente. Agora que o robo le o orcamento da atendente,
// quando o cliente fala de uma opcao de OUTRA marca desse orcamento (ex.: Comforser, "esse chines"), e CAT_T
// (outra marca -> "so um instante" + etiqueta), nunca CAT_L. E o contexto da leitura mostra o orcamento inteiro.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/data/fluxoPrecoExtrator.ts', [
  ['CAT_L = pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa ("isso e chines?", "e pneu chines?") SEM perguntar tambem sobre remold, recauchutado ou por que e barato (se perguntar isso junto, e CAT_G).',
   'CAT_L = pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa ("isso e chines?", "e pneu chines?") SEM perguntar tambem sobre remold, recauchutado ou por que e barato (se perguntar isso junto, e CAT_G). Se o contexto mostra que a ATENDENTE mandou um orcamento com opcoes de outras marcas (linhas "(foto que a atendente mandou)" ou "(áudio da atendente)") e o cliente pergunta se e chines sobre uma DESSAS opcoes (ex.: a opcao chinesa do orcamento), e CAT_T, nao CAT_L.'],
  ['So vale quando o cliente CITA o nome de uma marca ou pergunta por "outras marcas":',
   'Tambem e CAT_T quando o cliente pergunta, comenta ou escolhe uma opcao de OUTRA marca (que nao e GP Premium) que a ATENDENTE ofereceu no orcamento — o contexto mostra "(foto que a atendente mandou)" ou "(áudio da atendente)" com essas marcas (ex.: "esse Comforser ta num preco bom", "quero o Dunlop", "o chines ne?", "o mais barato do orcamento" quando nao e o GP). So vale quando o cliente CITA o nome de uma marca, pergunta por "outras marcas" ou se refere a uma opcao de outra marca do orcamento da atendente:'],
], 'opcao de OUTRA marca (que nao e GP Premium)');

patch('src/bot-service/server.ts', [
  ["          .map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'ROBO'}: ${String(m.content || '').slice(0, 200)}`)",
   "          // Orcamento/audio da atendente lido pelo robo (21/10) e comprido: cabe inteiro, senao as marcas somem.\n          .map((m: any) => { const t = String(m.content || ''); const daAtendente = /^\\((foto que a atendente mandou|áudio da atendente)\\)/.test(t); return `${m.role === 'user' ? 'CLIENTE' : daAtendente ? 'ATENDENTE' : 'ROBO'}: ${t.slice(0, daAtendente ? 900 : 200)}`; })"],
], 'Orcamento/audio da atendente lido pelo robo');
