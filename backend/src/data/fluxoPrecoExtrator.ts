import { IntencaoExtraida, IntencaoTipo } from './fluxoPreco';

// CAMADA 1 do fluxo deterministico de preco (10/09). Unica funcao desta feature
// que fala com a OpenAI. So EXTRAI o que o cliente quis dizer, em formulario
// fixo (json_schema estrito) — nunca decide o que responder, nunca gera preco.
// Ver docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md e
// docs/superpowers/specs/2026-09-18-fluxo-atendimento-completo-design.md.

// ACHADO EMPIRICO (achado no review da Task 5, 15/09): com o gpt-5-mini em
// json_schema estrito, usar os nomes REAIS da intencao ('DAR_MEDIDA',
// 'PERGUNTAR_PRECO_SEM_MEDIDA', 'PERGUNTA_TECNICA' etc.) como os proprios
// VALORES do enum faz o modelo classificar erroneamente mensagens de preco
// puras e sem contexto (ex.: "quanto custa?") como PERGUNTA_TECNICA — de forma
// reproduzivel, IGNORANDO qualquer instrucao/exemplo/ordem de decisao no
// prompt (testado exaustivamente: instrucao minima, instrucao detalhada,
// exemplos literais, reasoning effort alto, reordenar o enum — nada disso
// mudou o resultado). Trocar os VALORES do enum por codigos neutros
// (CAT_A..CAT_F), mantendo o significado so na description, resolveu 100%
// nos testes (6/6 variantes, incluindo varias frases de preco diferentes).
// O nome da propriedade ('intencao') nao influencia — so os valores do enum.
// Por isso o enum abaixo usa codigos neutros, e a funcao mapeia de volta pro
// IntencaoTipo real depois da resposta da API. NAO reverta pros nomes
// descritivos sem re-testar — o bug volta. Toda categoria nova segue o mesmo padrao.
const CODIGO_PARA_INTENCAO: Record<string, IntencaoTipo> = {
  CAT_A: 'DAR_MEDIDA',
  CAT_B: 'PERGUNTAR_PRECO_SEM_MEDIDA',
  CAT_C: 'RESPONDER_QUANTIDADE',
  CAT_D: 'ESCOLHER_ALTERNATIVA',
  CAT_E: 'PERGUNTA_TECNICA',
  CAT_F: 'OUTRO_ASSUNTO',
  // CAT_G adicionado 18/09 (pergunta se e remold) — mesma logica de codigo opaco acima:
  // NAO renomear pro nome real no enum/schema, so aqui no mapa de volta.
  CAT_G: 'PERGUNTOU_SE_E_REMOLD',
  // CAT_H..CAT_S adicionados 18/09 (atendimento completo) — idem, so o mapa de volta tem o nome real.
  CAT_H: 'PERGUNTOU_PARCELAMENTO_GENERICO',
  CAT_I: 'PERGUNTOU_PARCELAMENTO_ESPECIFICO',
  CAT_J: 'PERGUNTOU_SE_TEM_JUROS',
  CAT_K: 'PERGUNTOU_DESCONTO_AVISTA',
  CAT_L: 'PERGUNTOU_SE_E_CHINES',
  CAT_M: 'OFERECEU_BASE_TROCA',
  CAT_N: 'OFERECEU_VENDER_USADO',
  CAT_O: 'PERGUNTOU_NOTA_FISCAL',
  CAT_P: 'PERGUNTOU_BALANCEAMENTO',
  CAT_Q: 'PERGUNTOU_ALINHAMENTO',
  CAT_R: 'PEDIU_LOCALIZACAO',
  CAT_S: 'OBJETOU_PRECO_OU_MARCA',
};

const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: {
    intencao: {
      type: 'string',
      enum: ['CAT_A', 'CAT_B', 'CAT_C', 'CAT_D', 'CAT_E', 'CAT_F', 'CAT_G', 'CAT_H', 'CAT_I', 'CAT_J', 'CAT_K', 'CAT_L', 'CAT_M', 'CAT_N', 'CAT_O', 'CAT_P', 'CAT_Q', 'CAT_R', 'CAT_S'],
      description: 'CAT_A = cliente informou a medida do pneu nesta mensagem (mesmo em formato estranho, tipo "16r 205 55" ou "225/70 aro 17"). CAT_B = pergunta de preco/valor SEM informar a medida nesta mensagem — inclui perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", mesmo sem citar produto, medida ou qualquer outro detalhe; uma pergunta assim, pura e sem mais nada, e SEMPRE CAT_B — MAS se a mensagem tambem desconfiar/perguntar sobre remold/procedencia, e CAT_G, nao CAT_B. CAT_C = informou quantos pneus quer (numero de unidades), sem dar medida nova. CAT_D = esta escolhendo uma das opcoes de medida que JA foram oferecidas antes (contexto da conversa), mesmo so repetindo a medida escolhida. CAT_E = pergunta sobre uma caracteristica tecnica CONCRETA do produto que NAO e preco e NAO e sobre remold/procedencia — exige que a mensagem cite algo especifico tipo capacidade de carga em kg, durabilidade, garantia, material ou resistencia; sem essa caracteristica citada explicitamente, NUNCA e CAT_E, mesmo que a mensagem seja curta ou sem contexto. CAT_F = qualquer outra coisa (saudacao, agradecimento, reclamacao que nao seja de preco/marca, papo solto). CAT_G = o cliente pergunta diretamente se o pneu e remold, recauchutado, recapado ou usado, OU desconfia/insinua isso de forma indireta (ex.: "por que e tao barato?", "e original mesmo?", "e pneu de verdade?"), mesmo sem usar a palavra "remold" — isso e SEMPRE CAT_G, nunca CAT_E (que e so sobre capacidade/durabilidade/peso, sem nenhuma relacao com origem/procedencia do pneu) nem CAT_B (pergunta de preco pura, sem nenhuma desconfianca sobre remold/procedencia). CAT_H = pergunta se PARCELA / se da pra parcelar / se aceita cartao parcelado, SEM citar em quantas vezes ("parcela?", "da pra parcelar?", "tem parcelamento?"). CAT_I = pergunta o valor em um NUMERO ESPECIFICO de parcelas (ex.: "em 6x fica quanto?", "quanto fica em 10x?", "parcelando em 3 vezes?", inclusive com erro de digitacao tipo "passeando"/"passelar" no lugar de "parcelando") — preencha parcelas_extraida com esse numero. CAT_J = pergunta se o parcelamento e SEM JUROS ou se tem juros/acrescimo nas parcelas. CAT_K = pergunta se tem DESCONTO, pede desconto ou preco melhor, ou pergunta de desconto pagando a vista/em dinheiro/no pix ("a vista tem desconto?", "faz desconto?", "no pix tem desconto?", "no dinheiro fica quanto?") — preencha forma_pagamento_extraida quando ele citar dinheiro ou pix. CAT_L = pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa ("isso e chines?", "e pneu chines?") SEM perguntar tambem sobre remold, recauchutado ou por que e barato (se perguntar isso junto, e CAT_G). CAT_M = quer dar o pneu usado dele como parte do pagamento / base de troca / trocar o pneu velho por novo dando o velho de entrada. CAT_N = quer VENDER o pneu usado dele pra loja, ou pergunta se a loja COMPRA pneu usado (sem ser como parte do pagamento). CAT_O = pergunta sobre nota fiscal (se emite, se da nota, se tem nota). CAT_P = pergunta sobre balanceamento (se faz, quanto custa) — se citar quantos pneus/rodas, preencha quantidade_extraida. CAT_Q = pergunta sobre alinhamento (se faz, quanto custa). CAT_R = pede o endereco, a localizacao da loja, onde fica, ou pede pra mandar a localizacao / o pino do mapa. CAT_S = reclama que o preco esta caro, diz que achou mais barato em outro lugar, ou desqualifica a marca/qualidade ("essa marca nao presta", "ta muito caro"), SEM fazer nenhuma pergunta concreta nova na mesma mensagem (se tambem perguntar algo concreto tipo desconto ou parcelamento, vale a categoria da pergunta concreta).',
    },
    medida_extraida: {
      type: ['string', 'null'],
      description: 'Medida do pneu no formato EXATO "LARGURA/PERFIL/ARO" (ex.: "205/55/16"), so quando o cliente deu uma medida completa nesta mensagem — normalize qualquer ordem/separador (ex.: "16r 205 55" ou "225/70 aro 17" viram "225/70/17"). null se nao houver medida completa nesta mensagem.',
    },
    quantidade_extraida: {
      type: ['integer', 'null'],
      description: 'Quantidade de pneus (ou rodas) mencionada nesta mensagem (ex.: "preciso de 4" = 4, "balanceamento dos 4" = 4). null se nao mencionou.',
    },
    escolha_alternativa: {
      type: ['string', 'null'],
      description: 'Se o cliente esta escolhendo uma das medidas alternativas que JA foram oferecidas a ele (contexto anterior), a medida escolhida no formato LARGURA/PERFIL/ARO. null se nao se aplica.',
    },
    parcelas_extraida: {
      type: ['integer', 'null'],
      description: 'Em quantas vezes (parcelas) o cliente perguntou o valor nesta mensagem (ex.: "em 6x fica quanto?" = 6). null se nao citou um numero de parcelas.',
    },
    forma_pagamento_extraida: {
      type: ['string', 'null'],
      description: 'Forma de pagamento citada nesta mensagem pra falar de desconto: a palavra "dinheiro" se citou dinheiro/especie, a palavra "pix" se citou pix. null se nao citou nenhuma das duas.',
    },
  },
  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa', 'parcelas_extraida', 'forma_pagamento_extraida'],
  additionalProperties: false,
};

// IMPORTANTE: este texto NAO cita os nomes reais das intencoes (DAR_MEDIDA,
// PERGUNTA_TECNICA etc.) de proposito — so os codigos neutros CAT_A..CAT_S,
// que sao os mesmos usados no enum do schema. Ver comentario grande acima de
// SCHEMA_EXTRACAO: citar os nomes descritivos aqui (mesmo so como explicacao,
// sem serem o valor de saida) nao foi testado e e mais seguro evitar.
const INSTRUCAO = [
  'Voce classifica UMA mensagem de cliente de uma loja de pneus, pra um sistema que decide a resposta certa, usando os codigos CAT_A..CAT_S descritos no schema.',
  'Siga esta ORDEM de verificacao e pare no PRIMEIRO item que bater — nao pule direto pra CAT_E nem trate falta de contexto como motivo pra escolher ela:',
  '1. Existe uma lista de alternativas de medida JA oferecida no contexto da conversa (mensagem anterior do robo oferecendo mais de uma opcao), e nesta mensagem o cliente esta escolhendo uma delas — mesmo so repetindo a medida escolhida, tipo "pode ser essa de 205/55/17" ou so "205/55/17"? Se sim -> CAT_D (mesmo a mensagem contendo uma medida completa).',
  '2. A mensagem pergunta se o parcelamento e sem juros / se tem juros? Se sim -> CAT_J.',
  '3. A mensagem pergunta o valor em um NUMERO ESPECIFICO de parcelas ("em 6x fica quanto?", "quanto fica em 10x?")? Se sim -> CAT_I, preenchendo parcelas_extraida — e se a mesma mensagem tambem trouxer uma medida completa, preencha tambem medida_extraida (CAT_I vence CAT_A).',
  '4. A mensagem pergunta se tem desconto / pede desconto / pergunta de desconto a vista, no dinheiro ou no pix? Se sim -> CAT_K, preenchendo forma_pagamento_extraida se citou dinheiro ou pix — e se a mesma mensagem tambem trouxer uma medida completa, preencha tambem medida_extraida (CAT_K vence CAT_A).',
  '5. A mensagem contem uma medida completa de pneu (LARGURA/PERFIL/ARO, em qualquer formato/ordem, ex.: "16r 205 55" ou "225/70 aro 17") e os itens anteriores nao se aplicam? Se sim -> CAT_A.',
  '6. A mensagem so informa uma quantidade de pneus (numero de unidades), sem medida nova? Se sim -> CAT_C.',
  '7. A mensagem pergunta diretamente se o pneu e remold, recauchutado, recapado, ou usado — OU desconfia/insinua isso de forma indireta, mesmo sem citar a palavra "remold" (ex.: "por que e tao barato?", "e original mesmo?", "e pneu de verdade?")? Se sim -> CAT_G. Isso vale mesmo que a mensagem tambem cite preco ou a palavra "chines" (ex.: "por que e tao barato, e chines?" e sobre desconfianca de procedencia, nao so preco) — a desconfianca sobre remold/procedencia sempre vence e vira CAT_G, nunca CAT_B, CAT_E nem CAT_L.',
  '8. A mensagem pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa, sem nenhuma pergunta sobre remold ou sobre por que e barato? Se sim -> CAT_L.',
  '9. A mensagem pergunta se PARCELA / se da pra parcelar, sem citar quantas vezes? Se sim -> CAT_H.',
  '10. A mensagem oferece o pneu usado dele como parte do pagamento / base de troca / trocar o velho por novo? Se sim -> CAT_M.',
  '11. A mensagem quer vender o pneu usado dele pra loja, ou pergunta se a loja compra pneu usado? Se sim -> CAT_N.',
  '12. A mensagem pergunta sobre nota fiscal? Se sim -> CAT_O.',
  '13. A mensagem pergunta sobre balanceamento (se faz, quanto custa)? Se sim -> CAT_P (preencha quantidade_extraida se citou quantos pneus/rodas).',
  '14. A mensagem pergunta sobre alinhamento (se faz, quanto custa)? Se sim -> CAT_Q.',
  '15. A mensagem pede o endereco / a localizacao da loja / onde fica / pede pra mandar a localizacao? Se sim -> CAT_R.',
  '16. A mensagem reclama que o preco esta caro, diz que achou mais barato em outro lugar, ou desqualifica a marca/qualidade, SEM fazer uma pergunta concreta nova? Se sim -> CAT_S.',
  '17. A mensagem cita ou pergunta EXPLICITAMENTE sobre uma caracteristica tecnica CONCRETA do produto, SEM nenhuma relacao com remold/procedencia — algo como capacidade de carga em kg, durabilidade, garantia, material, resistencia? So marque este item se essa caracteristica especifica realmente aparecer na mensagem (nao vale so "a mensagem e curta" ou "nao tem produto citado" — isso sozinho NAO conta como caracteristica tecnica). Se bateu -> CAT_E.',
  '18. A mensagem pergunta sobre preco/valor de qualquer forma — inclusive perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", MESMO sem citar produto, medida ou qualquer outro detalhe? Se sim -> CAT_B. Isso e o resultado padrao pra pergunta de preco pura e sem contexto — se a mensagem tivesse desconfianca sobre remold/procedencia ou uma caracteristica tecnica concreta, os itens anteriores ja teriam capturado antes de chegar aqui.',
  '19. Nenhum item acima bateu -> CAT_F (saudacao, agradecimento, reclamacao que nao e de preco/marca, papo solto, etc.).',
  'Exemplos de saida correta (formato exato esperado):',
  'Mensagem "quanto custa?", contexto vazio -> {"intencao":"CAT_B","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "qual o valor?", contexto vazio -> {"intencao":"CAT_B","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "Ele aguenta até quantos kg", contexto com preco ja dado -> {"intencao":"CAT_E","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "é remold isso?", contexto vazio -> {"intencao":"CAT_G","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "por que é tão barato, é chinês?", contexto vazio -> {"intencao":"CAT_G","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "isso é pneu chinês?", contexto vazio -> {"intencao":"CAT_L","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "quanto fica em 6x?", contexto com preco ja dado -> {"intencao":"CAT_I","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":6,"forma_pagamento_extraida":null}',
  'Mensagem "parcela?", contexto vazio -> {"intencao":"CAT_H","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "é sem juros?", contexto com preco ja dado -> {"intencao":"CAT_J","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "no pix tem desconto?", contexto com preco ja dado -> {"intencao":"CAT_K","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":"pix"}',
  'Mensagem "faz balanceamento? sao 4 pneus", contexto vazio -> {"intencao":"CAT_P","medida_extraida":null,"quantidade_extraida":4,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "onde fica a loja?", contexto vazio -> {"intencao":"CAT_R","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'Mensagem "achei caro, essa marca nao presta", contexto com preco ja dado -> {"intencao":"CAT_S","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null}',
  'NUNCA calcule nem mencione preco — isso nao e sua tarefa, so classifique e extraia.',
].join('\n');

export async function extrairIntencaoPreco(
  mensagemAtual: string,
  contextoRecente: string,
  apiKey: string
): Promise<IntencaoExtraida | null> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: INSTRUCAO }] },
          { role: 'user', content: [{ type: 'input_text', text: `Contexto recente da conversa (mais antiga primeiro):\n${contextoRecente.slice(0, 1500)}\n\nMENSAGEM ATUAL A CLASSIFICAR:\n${mensagemAtual.slice(0, 500)}` }] },
        ],
        text: { format: { type: 'json_schema', name: 'extracao_preco', strict: true, schema: SCHEMA_EXTRACAO } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[FluxoPreco][Extrator] Falha na API:', resp.status, body?.error?.message);
      return null;
    }
    const textoSaida = extrairTextoJson(body);
    if (!textoSaida) return null;
    const parsed = JSON.parse(textoSaida);
    const intencaoReal = CODIGO_PARA_INTENCAO[parsed.intencao];
    if (!intencaoReal) return null;
    const forma = typeof parsed.forma_pagamento_extraida === 'string' ? parsed.forma_pagamento_extraida.trim().toLowerCase() : '';
    return {
      intencao: intencaoReal,
      medidaExtraida: typeof parsed.medida_extraida === 'string' ? parsed.medida_extraida : null,
      quantidadeExtraida: typeof parsed.quantidade_extraida === 'number' ? parsed.quantidade_extraida : null,
      escolhaAlternativa: typeof parsed.escolha_alternativa === 'string' ? parsed.escolha_alternativa : null,
      parcelasExtraida: typeof parsed.parcelas_extraida === 'number' ? parsed.parcelas_extraida : null,
      formaPagamentoExtraida: forma === 'dinheiro' || forma === 'pix' ? forma : null,
    };
  } catch (e: any) {
    console.error('[FluxoPreco][Extrator] Erro:', e?.message || e);
    return null; // falha = trata como OUTRO_ASSUNTO no chamador (fail-safe, nunca trava o cliente)
  }
}

// Mesmo padrao de extracao de texto do gerarRespostaViaOpenAI (bot-service/server.ts):
// tenta output_text no topo primeiro, senao percorre output[].content[] olhando tanto
// `text` quanto `output_text` em cada item — mantem consistencia com o unico outro
// lugar do projeto que ja fala com a Responses API de verdade.
function extrairTextoJson(payload: any): string | null {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const texto = typeof content?.text === 'string'
        ? content.text
        : typeof content?.output_text === 'string'
          ? content.output_text
          : '';
      if (texto.trim()) return texto.trim();
    }
  }
  return null;
}

// Filtro barato (nao gasta chamada de IA em papo solto obviamente fora do assunto).
// So retorna false quando tem certeza que NAO e sobre nenhuma categoria conhecida — na
// duvida, deixa passar pro extrator decidir (ele e mais confiavel que regex).
// Fix pos-review Task 4: o design diz que depois do preco confirmado toda mensagem
// nova ainda passa pela extratora (ex.: "tem algo mais em conta?" sem digito/keyword
// nao pode escapar do fluxo). E medida falada por extenso via audio (ex.: "duzentos
// e vinte e cinco setenta aro dezessete") tambem nao tem digito nem keyword de preco
// — mas "aro"/"pneu(s)" sao praticamente exclusivos desse contexto (ver
// normalizarTextoMedida em tabelaPrecos.ts, que existe justamente pra tratar essa
// forma de entrada), entao entram como keyword de baixo risco de falso-positivo.
export function podeSerSobrePreco(mensagem: string, estadoAtual: string): boolean {
  if (estadoAtual === 'aguardando_medida' || estadoAtual === 'medida_sem_match' || estadoAtual === 'preco_confirmado') return true; // esperando resposta especifica ou conversa ja em fluxo de preco
  const t = String(mensagem || '').toLowerCase();
  if (/\d/.test(t)) return true; // tem numero (pode ser medida ou quantidade)
  if (/pre[cç]o|quanto|valor|vist[a-z]|parcel|cotar|cota[cç][aã]o|\baro\b|\bpneus?\b/.test(t)) return true;
  // Achado 18/09 (Task remold): uma pergunta de remold "fria" (ex.: "é remold isso?",
  // sem nenhuma palavra de preco/aro/pneu e sem estado de fluxo em andamento) NAO batia
  // em nenhum dos filtros acima e nunca chegava na IA extratora — o novo branch
  // deterministico (PERGUNTOU_SE_E_REMOLD -> RESPONDER_REMOLD) simplesmente nunca era
  // acionado pra esse caso, o mais comum na vida real. Sem esta linha, a UNICA coisa que
  // trata essa pergunta e o texto solto em PROMPT_ATENDIMENTO (ver bot-pneus-config.json).
  if (/remold|recauch|recap|chin[eê]s/.test(t)) return true;
  // Atendimento completo (18/09): as demais categorias do fluxo tambem chegam "frias"
  // (sem numero nem palavra de preco) — juros, desconto, troca/usado, nota fiscal,
  // balanceamento, alinhamento, endereco/localizacao, objecao de preco/marca.
  if (/juro|desconto|dinheiro|\bpix\b|cart[aã]o|cr[eé]dito|d[eé]bito|troca|usado|nota fiscal|\bnf\b|balancea|alinha|localiza|endere[cç]o|onde (fica|[eé]|voc)|\bmapa\b|\bcaro\b|barato|n[aã]o presta|marca/.test(t)) return true;
  return false;
}
