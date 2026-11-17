// 22/10: (a) medida na mesma rajada de "qual o preco do aro 15?" -> nao pede medida antes do preco;
// (b) "ainda tem? / ainda esta ai?" e disponibilidade, nao "e novo?".
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
patch('src/bot-service/server.ts', [
  [`          const decisao = decidirSequenciaPreco(intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });`,
   `          // A rajada ja traz a medida ("qual o preco do aro 15?" + "185/60"): nao pede a medida antes do preco (22/10).
          const temMedidaNaRajada = intencoes.some((i: any) => i.medidaExtraida || i.intencao === 'DAR_MEDIDA');
          const intencoesUsadas = temMedidaNaRajada ? intencoes.filter((i: any) => i.intencao !== 'PERGUNTAR_PRECO_SEM_MEDIDA') : intencoes;
          const decisao = decidirSequenciaPreco(intencoesUsadas.length ? intencoesUsadas : intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });`],
], 'temMedidaNaRajada');
patch('src/data/fluxoPrecoExtrator.ts', [
  ['CAT_W = pergunta se o pneu e NOVO, se so tem pneu novo,',
   'CAT_W (NAO e CAT_W perguntar se o pneu AINDA TEM / ainda esta ai / ainda esta disponivel / tem a pronta entrega — isso e disponibilidade, CAT_F) = pergunta se o pneu e NOVO, se so tem pneu novo,'],
], 'isso e disponibilidade, CAT_F');
