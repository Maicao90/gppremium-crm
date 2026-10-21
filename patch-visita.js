// Visita na loja (21/10): cliente diz que vem -> robo confirma, anota e agenda lembrete (vespera se longe + no dia).
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

fs.copyFileSync(base + '/../visita.ts', base + '/src/data/visita.ts');
console.log('src/data/visita.ts ok');

patch('src/data/fluxoPreco.ts', [
  ["  | 'PERGUNTOU_SERVICO_OFICINA'\n", "  | 'PERGUNTOU_SERVICO_OFICINA'\n  | 'VAI_VIR_NA_LOJA'\n"],
  ["  | 'RESPONDER_SERVICO_OFICINA'\n", "  | 'RESPONDER_SERVICO_OFICINA'\n  | 'CONFIRMAR_VISITA'\n"],
  ["  formaPagamentoExtraida?: 'dinheiro' | 'pix' | null;\n}", "  formaPagamentoExtraida?: 'dinheiro' | 'pix' | null;\n  // Dia que o cliente disse que vem na loja ('hoje', 'amanha', 'sabado', '25', '25/10'...). Ver data/visita.ts.\n  diaVisita?: string | null;\n}"],
  ["    case 'PERGUNTOU_SERVICO_OFICINA':\n      return respostaTexto('RESPONDER_SERVICO_OFICINA', textoFluxo(textos, 'servico_oficina'), estadoAtual, dadosAtuais, 'servico_oficina');\n",
   "    case 'PERGUNTOU_SERVICO_OFICINA':\n      return respostaTexto('RESPONDER_SERVICO_OFICINA', textoFluxo(textos, 'servico_oficina'), estadoAtual, dadosAtuais, 'servico_oficina');\n\n    // 21/10: cliente diz que vem na loja. Com dia: confirma ({DIA} o bot-service preenche) e o whatsapp-crm agenda os lembretes.\n    case 'VAI_VIR_NA_LOJA':\n      return intencao.diaVisita\n        ? respostaTexto('CONFIRMAR_VISITA', textoFluxo(textos, 'visita_confirmada'), estadoAtual, dadosAtuais, 'visita_confirmada')\n        : respostaTexto('CONFIRMAR_VISITA', textoFluxo(textos, 'visita_sem_dia'), estadoAtual, dadosAtuais, 'visita_sem_dia');\n"],
], 'VAI_VIR_NA_LOJA');

patch('src/data/fluxoPrecoExtrator.ts', [
  ["  CAT_AD: 'PERGUNTOU_SERVICO_OFICINA',\n", "  CAT_AD: 'PERGUNTOU_SERVICO_OFICINA',\n  // CAT_AE adicionado 21/10 (cliente diz que vem na loja).\n  CAT_AE: 'VAI_VIR_NA_LOJA',\n"],
  ["'CAT_AA', 'CAT_AB', 'CAT_AC', 'CAT_AD'],", "'CAT_AA', 'CAT_AB', 'CAT_AC', 'CAT_AD', 'CAT_AE'],"],
  ["barulho no carro, orcamento de oficina.',",
   "barulho no carro, orcamento de oficina. CAT_AE = o cliente diz que VAI VIR / PASSAR na loja pra comprar, trocar ou montar (\"vou passar ai sabado\", \"amanha cedo eu vou\", \"hoje a tarde eu passo ai\", \"dia 25 eu vou\", \"semana que vem eu passo ai\") — preencha dia_visita_extraido. Pergunta de horario (\"abre sabado?\") NAO e CAT_AE (e CAT_U).',"],
  ["    forma_pagamento_extraida: {\n      type: ['string', 'null'],\n      description: 'Forma de pagamento citada nesta mensagem pra falar de desconto: a palavra \"dinheiro\" se citou dinheiro/especie, a palavra \"pix\" se citou pix. null se nao citou nenhuma das duas.',\n    },\n  },\n  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa', 'parcelas_extraida', 'forma_pagamento_extraida'],",
   "    forma_pagamento_extraida: {\n      type: ['string', 'null'],\n      description: 'Forma de pagamento citada nesta mensagem pra falar de desconto: a palavra \"dinheiro\" se citou dinheiro/especie, a palavra \"pix\" se citou pix. null se nao citou nenhuma das duas.',\n    },\n    dia_visita_extraido: {\n      type: ['string', 'null'],\n      description: 'So no CAT_AE: o dia que o cliente disse que vem, normalizado: \"hoje\", \"amanha\", \"depois_de_amanha\", um dia da semana sem acento (\"segunda\", \"terca\", \"quarta\", \"quinta\", \"sexta\", \"sabado\", \"domingo\"), ou o dia do mes \"25\" ou \"25/10\". null se nao disse um dia certo (ex.: \"semana que vem\", \"qualquer dia\") ou se nao e CAT_AE.',\n    },\n  },\n  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa', 'parcelas_extraida', 'forma_pagamento_extraida', 'dia_visita_extraido'],"],
  ["const SEM_CAMPOS = '\"medida_extraida\":null,\"quantidade_extraida\":null,\"escolha_alternativa\":null,\"parcelas_extraida\":null,\"forma_pagamento_extraida\":null';",
   "const SEM_CAMPOS = '\"medida_extraida\":null,\"quantidade_extraida\":null,\"escolha_alternativa\":null,\"parcelas_extraida\":null,\"forma_pagamento_extraida\":null,\"dia_visita_extraido\":null';"],
  ["const base: Record<string, string | number | null> = { medida_extraida: null, quantidade_extraida: null, escolha_alternativa: null, parcelas_extraida: null, forma_pagamento_extraida: null, ...campos };",
   "const base: Record<string, string | number | null> = { medida_extraida: null, quantidade_extraida: null, escolha_alternativa: null, parcelas_extraida: null, forma_pagamento_extraida: null, dia_visita_extraido: null, ...campos };"],
  ["    formaPagamentoExtraida: forma === 'dinheiro' || forma === 'pix' ? forma : null,\n  };",
   "    formaPagamentoExtraida: forma === 'dinheiro' || forma === 'pix' ? forma : null,\n    diaVisita: typeof bruto.dia_visita_extraido === 'string' && bruto.dia_visita_extraido.trim() ? bruto.dia_visita_extraido.trim() : null,\n  };"],
  ["usando os codigos CAT_A..CAT_AD", "usando os codigos CAT_A..CAT_AE"],
  ["  'Mensagem \"quanto fica a troca de oleo?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AD')),\n",
   "  'Mensagem \"quanto fica a troca de oleo?\", contexto vazio -> ' + SAIDA(ITEM('CAT_AD')),\n  'Mensagem \"vou passar ai no sabado pra trocar\", contexto com preco ja dado -> ' + SAIDA(ITEM_COM('CAT_AE', { dia_visita_extraido: 'sabado' })),\n  'Mensagem \"amanha cedo eu vou ai\", contexto com preco ja dado -> ' + SAIDA(ITEM_COM('CAT_AE', { dia_visita_extraido: 'amanha' })),\n  'Mensagem \"semana que vem eu passo ai\", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AE')),\n"],
], 'CAT_AE');

patch('src/data/fluxoCatalogo.ts', [
  ["  {\n    chave: 'servico_oficina',",
   "  {\n    chave: 'visita_confirmada',\n    grupo: 'loja',\n    titulo: 'Cliente diz que vem (com dia)',\n    quando: 'O cliente diz que vem na loja num dia certo (\"vou sábado\", \"amanhã eu passo aí\"). O robô confirma e agenda sozinho os lembretes: na véspera (se faltar 2 dias ou mais) e no dia de manhã. {DIA} vira \"amanhã\", \"no sábado (25/10)\"...',\n    exemplos: ['vou passar aí sábado', 'amanhã cedo eu vou', 'dia 25 eu passo aí'],\n    partes: ['Combinado! Fica anotado aqui: te espero {DIA} 😊', 'Qualquer coisa é só me chamar por aqui.'],\n  },\n  {\n    chave: 'visita_sem_dia',\n    grupo: 'loja',\n    titulo: 'Cliente diz que vem (sem dia certo)',\n    quando: 'O cliente diz que vem, mas sem dia certo (\"semana que vem\", \"qualquer dia\").',\n    exemplos: ['semana que vem eu passo aí', 'qualquer dia eu vou'],\n    partes: ['Combinado! Quando souber o dia, me avisa que eu já deixo anotado aqui 😊'],\n  },\n  {\n    chave: 'servico_oficina',"],
], 'visita_confirmada');

patch('src/bot-service/server.ts', [
  ["import { extrairIntencoesPreco } from '../data/fluxoPrecoExtrator';",
   "import { extrairIntencoesPreco } from '../data/fluxoPrecoExtrator';\nimport { resolverDiaVisita } from '../data/visita';"],
  ["          const decisao = decidirSequenciaPreco(intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });",
   `          const decisao = decidirSequenciaPreco(intencoes, estadoUsado, dadosUsados, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas, lojaFalouHaPouco });
          // Visita: resolve o dia (data/visita.ts) e preenche {DIA}. Dia que nao se resolve vira o texto "sem dia".
          let visita: { iso: string; rotulo: string; diasAte: number } | null = null;
          if (decisao.chaves.includes('visita_confirmada')) {
            visita = resolverDiaVisita(intencoes.find((i: any) => i.intencao === 'VAI_VIR_NA_LOJA')?.diaVisita);
            const semDia = textoFluxo(textosFluxo, 'visita_sem_dia');
            const comDia = textoFluxo(textosFluxo, 'visita_confirmada');
            const ini = decisao.partes.findIndex((p: string) => p === comDia[0]);
            if (ini >= 0) decisao.partes.splice(ini, comDia.length, ...(visita ? comDia.map((p) => p.replace(/\\{DIA\\}/g, (visita as any).rotulo)) : semDia));
          }`],
], 'resolverDiaVisita');

patch('src/bot-service/server.ts', [
  ["              chaves: decisao.chaves,\n              rajada,\n              simulado: !!req.body?.simular,\n            });\n          }\n          motivoLivre = ignorariaAFoto",
   "              chaves: decisao.chaves,\n              // Dia da visita (cliente disse que vem): o whatsapp-crm agenda os lembretes (vespera e no dia).\n              visita,\n              rajada,\n              simulado: !!req.body?.simular,\n            });\n          }\n          motivoLivre = ignorariaAFoto"],
], 'visita,\n');
