// City (oficina, 21/10): categoria "servico de oficina" + por loja, quais assuntos passam pra atendente (etiqueta + pausa).
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('SERVICO_OFICINA') || s.includes('servico_oficina') || s.includes('CHAVES_ATENDENTE')) { console.log(rel, 'ja aplicado'); return; }
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/data/fluxoPreco.ts', [
  ["  | 'PERGUNTOU_PROMOCAO_LEVE4'\n", "  | 'PERGUNTOU_PROMOCAO_LEVE4'\n  | 'PERGUNTOU_SERVICO_OFICINA'\n"],
  ["  | 'RESPONDER_PROMOCAO_LEVE4'\n", "  | 'RESPONDER_PROMOCAO_LEVE4'\n  | 'RESPONDER_SERVICO_OFICINA'\n"],
  ["      return respostaTexto('RESPONDER_PROMOCAO_LEVE4', textoFluxo(textos, 'promocao_leve4'), estadoAtual, dadosAtuais, 'promocao_leve4');\n",
   "      return respostaTexto('RESPONDER_PROMOCAO_LEVE4', textoFluxo(textos, 'promocao_leve4'), estadoAtual, dadosAtuais, 'promocao_leve4');\n\n    // 21/10: servico de mecanica (freio, suspensao, oleo...). Loja so de pneu diz que nao faz; oficina (City) chama a equipe.\n    case 'PERGUNTOU_SERVICO_OFICINA':\n      return respostaTexto('RESPONDER_SERVICO_OFICINA', textoFluxo(textos, 'servico_oficina'), estadoAtual, dadosAtuais, 'servico_oficina');\n"],
]);

patch('src/data/fluxoPrecoExtrator.ts', [
  ["  CAT_AC: 'PERGUNTOU_PROMOCAO_LEVE4',\n", "  CAT_AC: 'PERGUNTOU_PROMOCAO_LEVE4',\n  // CAT_AD adicionado 21/10 (servico de oficina/mecanica — City).\n  CAT_AD: 'PERGUNTOU_SERVICO_OFICINA',\n"],
  ["'CAT_AA', 'CAT_AB', 'CAT_AC'],", "'CAT_AA', 'CAT_AB', 'CAT_AC', 'CAT_AD'],"],
  ["se levando 4 paga 3) — so pergunta sobre a promocao; se tambem deu medida, a medida vira outro item.',",
   "se levando 4 paga 3) — so pergunta sobre a promocao; se tambem deu medida, a medida vira outro item. CAT_AD = pede ou pergunta de SERVICO DE MECANICA que nao e pneu, alinhamento nem balanceamento: freio, pastilha, suspensao, amortecedor, troca de oleo, revisao, motor, embreagem, injecao, ar-condicionado, bateria, escapamento, barulho no carro, orcamento de oficina.',"],
  ["usando os codigos CAT_A..CAT_AC", "usando os codigos CAT_A..CAT_AD"],
]);
// exemplos do CAT_AD (depois dos do CAT_AC)
{
  const f = base + '/src/data/fluxoPrecoExtrator.ts';
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  const a = "  'Mensagem \"o leve 4 pague 3 e pra qual medida?\", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AC')),\n";
  if (!s.includes("ITEM('CAT_AD')")) {
    if (s.split(a).length !== 2) { console.error('ancora exemplos'); process.exit(1); }
    s = s.replace(a, () => a + "  'Mensagem \"vcs fazem troca de pastilha de freio?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AD')),\n  'Mensagem \"quanto fica a troca de oleo?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AD')),\n  'Mensagem \"meu carro ta com barulho na suspensao, vcs olham?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AD')),\n");
    if (crlf) s = s.replace(/\n/g, '\r\n');
    fs.writeFileSync(f, s); console.log('exemplos CAT_AD ok');
  }
}

patch('src/data/fluxoCatalogo.ts', [
  ["    partes: ['A promoção existe e é válida para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.'],\n  },\n",
   "    partes: ['A promoção existe e é válida para os pneus da marca GP Premium nas medidas 195/65/15 e 215/55/17.'],\n  },\n  {\n    chave: 'servico_oficina',\n    grupo: 'loja',\n    titulo: 'Serviço de mecânica (freio, suspensão, óleo…)',\n    quando: 'O cliente pergunta de serviço de oficina que não é pneu, alinhamento nem balanceamento. Na loja que é oficina (ex.: City), troque o texto e o robô passa a conversa pra equipe.',\n    exemplos: ['vcs fazem freio?', 'quanto a troca de óleo?', 'olham suspensão?'],\n    partes: ['Aqui a gente trabalha só com pneus — serviço de mecânica não fazemos, não.'],\n  },\n"],
]);

// por loja: assuntos que passam pra atendente (depois de responder, etiqueta + pausa)
patch('src/services/botLojas.ts', [
  ["  PAUSA_FORA_DA_LISTA_MIN?: number | undefined;\n}", "  PAUSA_FORA_DA_LISTA_MIN?: number | undefined;\n  // Assuntos que, nesta loja, a atendente assume: o robo responde o texto do assunto, etiqueta e fica quieto.\n  CHAVES_ATENDENTE?: string[] | undefined;\n}"],
  ["    PAUSA_FORA_DA_LISTA_MIN: num(daLoja?.PAUSA_FORA_DA_LISTA_MIN),\n", "    PAUSA_FORA_DA_LISTA_MIN: num(daLoja?.PAUSA_FORA_DA_LISTA_MIN),\n    CHAVES_ATENDENTE: Array.isArray(daLoja?.CHAVES_ATENDENTE) ? daLoja.CHAVES_ATENDENTE.map(String) : undefined,\n"],
]);

patch('src/workers/botAtendimentoService.ts', [
  ["    if (cfgLoja.ETIQUETA_FORA_DA_LISTA && resposta.deterministico && (resposta.chaves || []).some((c) => CHAVES_FORA_DA_LISTA.includes(c))) {",
   `    // + assuntos que ESTA loja passa pra equipe (City: servico de oficina, outra marca...): mesmo tratamento — o robo so diz
    // que vai verificar (nunca fala de atendente), etiqueta e fica quieto; a atendente entra logo depois.
    if (cfgLoja.ETIQUETA_FORA_DA_LISTA && resposta.deterministico && (resposta.chaves || []).some((c) => CHAVES_FORA_DA_LISTA.includes(c) || (cfgLoja.CHAVES_ATENDENTE || []).includes(c))) {`],
]);
