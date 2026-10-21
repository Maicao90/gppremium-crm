// Categoria nova (21/10): pergunta sobre a promocao "compre 3 e leve 4" -> texto fixo do dono.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes('LEVE4') || s.includes('promocao_leve4')) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/data/fluxoPreco.ts', [
  ["  | 'PERGUNTOU_GARANTIA'\n", "  | 'PERGUNTOU_GARANTIA'\n  | 'PERGUNTOU_PROMOCAO_LEVE4'\n"],
  ["  | 'RESPONDER_GARANTIA'\n", "  | 'RESPONDER_GARANTIA'\n  | 'RESPONDER_PROMOCAO_LEVE4'\n"],
  ["      return respostaTexto('RESPONDER_GARANTIA', textoFluxo(textos, 'garantia'), estadoAtual, dadosAtuais, 'garantia');\n",
   "      return respostaTexto('RESPONDER_GARANTIA', textoFluxo(textos, 'garantia'), estadoAtual, dadosAtuais, 'garantia');\n\n    // 21/10: promocao compre 3 e leve 4 — texto do dono (quais medidas valem).\n    case 'PERGUNTOU_PROMOCAO_LEVE4':\n      return respostaTexto('RESPONDER_PROMOCAO_LEVE4', textoFluxo(textos, 'promocao_leve4'), estadoAtual, dadosAtuais, 'promocao_leve4');\n"],
]);

patch('src/data/fluxoPrecoExtrator.ts', [
  ["  CAT_AB: 'PERGUNTOU_GARANTIA',\n", "  CAT_AB: 'PERGUNTOU_GARANTIA',\n  // CAT_AC adicionado 21/10 (promocao compre 3 e leve 4).\n  CAT_AC: 'PERGUNTOU_PROMOCAO_LEVE4',\n"],
  ["'CAT_AA', 'CAT_AB'],", "'CAT_AA', 'CAT_AB', 'CAT_AC'],"],
  ["sem desconfiar de remold (isso e CAT_G).',", "sem desconfiar de remold (isso e CAT_G). CAT_AC = pergunta sobre a promocao COMPRE 3 E LEVE 4 (se existe, se ainda vale, em quais medidas ou marcas vale, se levando 4 paga 3) — so pergunta sobre a promocao; se tambem deu medida, a medida vira outro item.',"],
  ["usando os codigos CAT_A..CAT_AB", "usando os codigos CAT_A..CAT_AC"],
  ["  'Mensagem \"tem garantia?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AB')),\n",
   "  'Mensagem \"tem garantia?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AB')),\n  'Mensagem \"essa promocao compre 3 leve 4 ainda vale?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AC')),\n  'Mensagem \"o leve 4 pague 3 e pra qual medida?\", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AC')),\n"],
]);

patch('src/data/fluxoCatalogo.ts', [
  ["    audio: { arquivo: 'garantia', modo: 'substitui' },\n  },\n",
   "    audio: { arquivo: 'garantia', modo: 'substitui' },\n  },\n  {\n    chave: 'promocao_leve4',\n    grupo: 'produto',\n    titulo: 'Promoção compre 3 e leve 4',\n    quando: 'O cliente pergunta da promoção compre 3 e leve 4: se existe, se vale, em quais medidas.',\n    exemplos: ['tem a promoção compre 3 leve 4?', 'o leve 4 vale pra qual medida?', 'levando 4 eu pago 3?'],\n    partes: ['A promoção existe e é válida para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.'],\n  },\n"],
]);
