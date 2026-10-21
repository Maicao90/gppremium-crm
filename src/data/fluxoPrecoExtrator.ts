import { IntencaoExtraida, IntencaoTipo } from './fluxoPreco';
import { ehChaveAnthropic, extrairEstruturadoAnthropic } from '../services/llmAnthropic';

// CAMADA 1 do fluxo deterministico de preco (10/09). Unica funcao desta feature
// que fala com a OpenAI. So EXTRAI o que o cliente quis dizer, em formulario
// fixo (json_schema estrito) — nunca decide o que responder, nunca gera preco.
// Ver docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md e
// docs/superpowers/specs/2026-09-18-fluxo-atendimento-completo-design.md.
//
// RAJADA (18/09, caso Marcia Lima): o cliente costuma mandar varias mensagens seguidas
// (preco + marca + endereco...). A extratora recebe TODAS as mensagens ainda sem resposta e
// devolve a LISTA de assuntos distintos, na ordem — o codigo (decidirSequenciaPreco) responde
// cada um. Antes so a ultima mensagem era lida e o resto ficava sem resposta.

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
  // CAT_H..CAT_T adicionados 18/09 (atendimento completo) — idem, so o mapa de volta tem o nome real.
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
  CAT_T: 'PERGUNTOU_POR_OUTRA_MARCA',
  CAT_U: 'PERGUNTOU_HORARIO',
  CAT_V: 'PEDIU_FOTO',
  CAT_W: 'PERGUNTOU_SE_E_NOVO',
  // CAT_X adicionado 21/09 (agradecimento/despedida/"vou pensar") — idem: nome real so aqui no mapa de volta.
  CAT_X: 'AGRADECEU_OU_ENCERROU',
  // CAT_Y/CAT_Z/CAT_AA adicionados 23/09 (fechar o que ainda caia na IA livre) — idem: nome real so aqui.
  CAT_Y: 'OFERTA_DE_FORNECEDOR',
  CAT_Z: 'PERGUNTOU_SE_E_NACIONAL',
  CAT_AA: 'SO_SAUDACAO',
  // CAT_AB adicionado 15/10 (garantia: audio do dono) — idem: nome real so aqui no mapa de volta.
  CAT_AB: 'PERGUNTOU_GARANTIA',
  // CAT_AC adicionado 21/10 (promocao compre 3 e leve 4).
  CAT_AC: 'PERGUNTOU_PROMOCAO_LEVE4',
};

const SCHEMA_ITEM = {
  type: 'object',
  properties: {
    intencao: {
      type: 'string',
      enum: ['CAT_A', 'CAT_B', 'CAT_C', 'CAT_D', 'CAT_E', 'CAT_F', 'CAT_G', 'CAT_H', 'CAT_I', 'CAT_J', 'CAT_K', 'CAT_L', 'CAT_M', 'CAT_N', 'CAT_O', 'CAT_P', 'CAT_Q', 'CAT_R', 'CAT_S', 'CAT_T', 'CAT_U', 'CAT_V', 'CAT_W', 'CAT_X', 'CAT_Y', 'CAT_Z', 'CAT_AA', 'CAT_AB', 'CAT_AC'],
      description: 'CAT_A = cliente informou a medida do pneu nesta mensagem (mesmo em formato estranho, tipo "16r 205 55" ou "225/70 aro 17"). CAT_B = pergunta de preco/valor SEM informar a medida nesta mensagem — inclui perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", mesmo sem citar produto, medida ou qualquer outro detalhe; uma pergunta assim, pura e sem mais nada, e SEMPRE CAT_B — MAS se a mensagem tambem desconfiar/perguntar sobre remold/procedencia, e CAT_G, nao CAT_B. CAT_C = informou quantos pneus quer (numero de unidades), sem dar medida nova. CAT_D = esta escolhendo uma das opcoes de medida que JA foram oferecidas antes (contexto da conversa), mesmo so repetindo a medida escolhida. CAT_E = pergunta sobre uma caracteristica tecnica CONCRETA do produto que NAO e preco e NAO e sobre remold/procedencia — exige que a mensagem cite algo especifico tipo capacidade de carga em kg, material ou resistencia (garantia e durabilidade em km/anos sao CAT_AB, nao CAT_E); sem essa caracteristica citada explicitamente, NUNCA e CAT_E, mesmo que a mensagem seja curta ou sem contexto. CAT_F = qualquer outra coisa (saudacao, reclamacao que nao seja de preco/marca, papo solto, informacao sobre a situacao dele) que NAO seja agradecimento/despedida (esses sao CAT_X). CAT_G = o cliente pergunta diretamente se o pneu e remold, recauchutado ou recapado, OU desconfia/insinua isso de forma indireta (ex.: "por que e tao barato?", "e original mesmo?", "e pneu de verdade?"), OU diz que nao quer remold ("remold to fora", "nao quero remold"), mesmo sem usar a palavra "remold" — isso e SEMPRE CAT_G, nunca CAT_E (que e so sobre capacidade/durabilidade/peso, sem nenhuma relacao com origem/procedencia do pneu) nem CAT_B (pergunta de preco pura, sem nenhuma desconfianca sobre remold/procedencia). CAT_H = pergunta se PARCELA / se da pra parcelar / se aceita cartao parcelado, SEM citar em quantas vezes ("parcela?", "da pra parcelar?", "tem parcelamento?"). CAT_I = pergunta o valor em um NUMERO ESPECIFICO de parcelas (ex.: "em 6x fica quanto?", "quanto fica em 10x?", "parcelando em 3 vezes?", inclusive com erro de digitacao tipo "passeando"/"passelar" no lugar de "parcelando") — preencha parcelas_extraida com esse numero. CAT_J = pergunta se o parcelamento e SEM JUROS ou se tem juros/acrescimo nas parcelas. CAT_K = pergunta se tem DESCONTO, pede desconto ou preco melhor, ou pergunta de desconto pagando a vista/em dinheiro/no pix ("a vista tem desconto?", "faz desconto?", "no pix tem desconto?", "no dinheiro fica quanto?") — preencha forma_pagamento_extraida quando ele citar dinheiro ou pix. CAT_L = pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa ("isso e chines?", "e pneu chines?") SEM perguntar tambem sobre remold, recauchutado ou por que e barato (se perguntar isso junto, e CAT_G). CAT_M = quer dar o pneu usado dele como parte do pagamento / base de troca / trocar o pneu velho por novo dando o velho de entrada. CAT_N = quer VENDER o pneu usado dele pra loja, ou pergunta se a loja COMPRA pneu usado (sem ser como parte do pagamento). CAT_O = pergunta sobre nota fiscal (se emite, se da nota, se tem nota). CAT_P = pergunta sobre balanceamento (se faz, quanto custa) — se citar quantos pneus/rodas, preencha quantidade_extraida. CAT_Q = pergunta sobre alinhamento (se faz, quanto custa). CAT_R = pede o endereco, a localizacao da loja, onde fica, ou pede pra mandar a localizacao / o pino do mapa. CAT_S = reclama que o preco esta caro, diz que achou mais barato em outro lugar, ou desqualifica a marca/qualidade ("essa marca nao presta", "ta muito caro"), SEM fazer nenhuma pergunta concreta nova na mesma mensagem (se tambem perguntar algo concreto tipo desconto ou parcelamento, vale a categoria da pergunta concreta). CAT_T = pergunta se a loja TEM ou trabalha com OUTRA marca de pneu — cita uma marca (Pirelli, Dunlop, Michelin, Goodyear, Bridgestone, Continental...) ou pergunta por "outras marcas" ("vc tem pirelli ou dunlop?", "tem michelin?", "trabalha com outras marcas?"). So vale quando o cliente CITA o nome de uma marca ou pergunta por "outras marcas": palavras como "dele", "desse", "novos" referindo-se ao pneu que ja esta na conversa NAO sao outra marca (ex.: "tem somente novos dele?" pergunta se o pneu e novo — isso e CAT_W). CAT_U = pergunta o HORARIO de funcionamento da loja, se esta aberta agora, ate que horas atende, se abre no sabado/domingo ("ta aberto agora?", "que horas fecha?", "qual o horario?"). CAT_V = pede FOTO ou imagem do pneu, ou pede pra ver o pneu por foto ("foto", "manda foto do pneu", "tem foto?", "me mostra o pneu"). CAT_W = pergunta se o pneu e NOVO, se so tem pneu novo, ou se tem "meia-vida" / usado / seminovo, SEM usar as palavras remold, recauchutado ou recapado ("e novo?", "tem somente novos?", "tem meia vida ou so pneus novos?", "pneu novo ou usado?", "e novo mesmo?"). CAT_X = a mensagem SO agradece, confirma que entendeu, se despede ou diz que vai pensar/decidir depois, SEM pedir nada e SEM nenhuma pergunta ("ok obrigado", "blz", "valeu", "beleza", "entendi", "combinado", "tchau", "vou pensar e te falo", "depois eu vejo", "mais tarde eu volto", "sem interesse", "nao quero mais", "desisti", "ja comprei"). Se a mesma mensagem tambem pedir ou perguntar qualquer coisa ("ok, e em 6x?"), vale a categoria do pedido, nunca CAT_X. CAT_Y = quem escreve NAO e cliente querendo comprar: e um VENDEDOR, FORNECEDOR, importadora, distribuidora, representante ou empresa OFERECENDO produtos, lista/tabela de precos, cotacao, catalogo ou parceria PARA A LOJA (ex.: "sou da importadora X, estou a disposicao pra cotacoes", uma lista de medidas com precos de outra marca oferecida pra loja revender). Cliente comparando preco ("vi mais barato em outra loja") NAO e CAT_Y (isso e CAT_S). CAT_Z = pergunta se o pneu e NACIONAL, fabricado no Brasil, importado, ou de onde ele vem / qual a origem ("e nacional?", "e feito no Brasil?", "e importado?", "de onde e esse pneu?") — vale mesmo que cite "chines" junto. CAT_AA = as mensagens SO cumprimentam ("oi", "ola", "bom dia", "boa tarde", "tudo bem?") e/ou sao so a legenda automatica de clique em anuncio ("📢 [Anúncio] ... Posso ter mais informações sobre isso?"), sem nenhuma pergunta ou pedido concreto. CAT_AB = pergunta sobre a GARANTIA do pneu: se tem garantia, de quanto tempo ou de quantos km e a garantia, como funciona a garantia, OU quantos km / quanto tempo o pneu dura ou roda ("qual a garantia?", "tem garantia?", "a garantia e de quanto tempo?", "quantos km roda esse pneu?", "dura quanto tempo?") — sem desconfiar de remold (isso e CAT_G). CAT_AC = pergunta sobre a promocao COMPRE 3 E LEVE 4 (se existe, se ainda vale, em quais medidas ou marcas vale, se levando 4 paga 3) — so pergunta sobre a promocao; se tambem deu medida, a medida vira outro item.',
    },
    medida_extraida: {
      type: ['string', 'null'],
      description: 'Medida do pneu no formato EXATO "LARGURA/PERFIL/ARO" (ex.: "205/55/16"), so quando o cliente deu uma medida completa nesta mensagem — normalize qualquer ordem/separador (ex.: "16r 205 55" ou "225/70 aro 17" viram "225/70/17"). null se nao houver medida completa nesta mensagem.',
    },
    quantidade_extraida: {
      type: ['integer', 'null'],
      description: 'Quantidade de pneus (ou rodas) mencionada nesta mensagem (ex.: "preciso de 4" = 4, "2 pneus" = 2, "balanceamento dos 4" = 4). null se nao mencionou.',
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

const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      description: 'Um item por ASSUNTO DISTINTO que o cliente pediu ou disse nas mensagens, na ordem em que apareceram. No maximo 4 itens. Se for so cumprimento/legenda do anuncio, um unico item CAT_AA; se for vendedor/fornecedor oferecendo pra loja, um unico item CAT_Y; se nada pedir nada concreto, um unico item CAT_F.',
      items: SCHEMA_ITEM,
    },
  },
  required: ['itens'],
  additionalProperties: false,
};

const SEM_CAMPOS = '"medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null,"parcelas_extraida":null,"forma_pagamento_extraida":null';
const ITEM = (cod: string, extra = '') => `{"intencao":"${cod}",${extra || SEM_CAMPOS}}`;
const ITEM_COM = (cod: string, campos: Record<string, string | number>) => {
  const base: Record<string, string | number | null> = { medida_extraida: null, quantidade_extraida: null, escolha_alternativa: null, parcelas_extraida: null, forma_pagamento_extraida: null, ...campos };
  return JSON.stringify({ intencao: cod, ...base });
};
const SAIDA = (...itens: string[]) => `{"itens":[${itens.join(',')}]}`;

// IMPORTANTE: este texto NAO cita os nomes reais das intencoes (DAR_MEDIDA,
// PERGUNTA_TECNICA etc.) de proposito — so os codigos neutros CAT_A..CAT_T,
// que sao os mesmos usados no enum do schema. Ver comentario grande acima de
// CODIGO_PARA_INTENCAO: citar os nomes descritivos aqui (mesmo so como explicacao,
// sem serem o valor de saida) nao foi testado e e mais seguro evitar.
const INSTRUCAO = [
  'Voce le as mensagens que UM cliente de uma loja de pneus mandou em sequencia (todas chegaram juntas, ainda sem resposta) e devolve a LISTA dos assuntos distintos que ele pediu ou disse, na ordem em que apareceram, usando os codigos CAT_A..CAT_AC descritos no schema.',
  'ANTES DE TUDO: se quem escreve e um VENDEDOR/FORNECEDOR/importadora/distribuidora/representante OFERECENDO produto, lista de precos, cotacao ou parceria PRA LOJA (nao e cliente querendo comprar), devolva UM item so, CAT_Y — mesmo que a mensagem tenha medidas e precos.',
  'REGRA MAIS IMPORTANTE: so gere itens para as mensagens sob "MENSAGENS DO CLIENTE A CLASSIFICAR". O "Contexto recente" serve APENAS pra entender referencias (ex.: "esses ai", "e em 6x?", "pode ser essa") — tudo o que aparece so no contexto JA FOI RESPONDIDO e NUNCA vira item. Exemplo: se o contexto tem o cliente perguntando o endereco e a loja ja respondendo, e a mensagem a classificar e "e em 6x fica quanto?", a lista tem UM item so (o das parcelas), nunca o endereco de novo.',
  'Regras da lista:',
  '- UM item por assunto distinto. Varias mensagens sobre o MESMO assunto (ex.: uma pergunta e depois "tem?", "esses ai", "blz", "sim") viram UM item so — nunca repita o mesmo assunto.',
  '- Uma MESMA mensagem pode trazer mais de um assunto (ex.: o preco de uma medida E se a loja tem outra marca): isso vira mais de um item.',
  '- Mensagem que so cumprimenta ou conta a situacao dele sem pedir nada (ex.: "boa tarde", "moro em Alexania, vou buscar ai") NAO vira item quando ha outro assunto. Se TODAS as mensagens forem so cumprimento e/ou a legenda do anuncio, devolva UM item CAT_AA. Se a lista ficar vazia por outro motivo (papo solto, informacao sem pergunta), devolva UM item CAT_F.',
  '- Mensagem que SO agradece, confirma ou se despede (ex.: "ok obrigado", "blz", "vou pensar") vira UM item CAT_X — mas so quando e a UNICA coisa das mensagens. Se houver qualquer outro assunto na lista, o agradecimento/"ok" NAO vira item.',
  '- A legenda automatica de clique em anuncio (comeca com "📢 [Anúncio]" ou traz "Posso ter mais informações sobre isso?") NAO e pergunta do cliente: ignore quando houver outra mensagem com assunto; sozinha (ou so com cumprimento) ela vira CAT_AA.',
  '- No maximo 4 itens (fique com os 4 primeiros).',
  'Para CADA item escolha o codigo seguindo esta ORDEM de verificacao e pare no PRIMEIRO passo que bater — nao pule direto pra CAT_E nem trate falta de contexto como motivo pra escolher ela:',
  '1. Existe uma lista de alternativas de medida JA oferecida no contexto da conversa (mensagem anterior do robo oferecendo mais de uma opcao), e o cliente esta escolhendo uma delas — mesmo so repetindo a medida escolhida, tipo "pode ser essa de 205/55/17" ou so "205/55/17"? Se sim -> CAT_D (mesmo contendo uma medida completa).',
  '2. Pergunta se o parcelamento e sem juros / se tem juros? Se sim -> CAT_J.',
  '3. Pergunta o valor em um NUMERO ESPECIFICO de parcelas ("em 6x fica quanto?", "quanto fica em 10x?")? Se sim -> CAT_I, preenchendo parcelas_extraida — e se a mesma mensagem tambem trouxer uma medida completa, preencha tambem medida_extraida (CAT_I vence CAT_A).',
  '4. Pergunta se tem desconto / pede desconto / pergunta de desconto a vista, no dinheiro ou no pix? Se sim -> CAT_K, preenchendo forma_pagamento_extraida se citou dinheiro ou pix — e se a mesma mensagem tambem trouxer uma medida completa, preencha tambem medida_extraida (CAT_K vence CAT_A).',
  '5. Traz uma medida completa de pneu (LARGURA/PERFIL/ARO, em qualquer formato/ordem, ex.: "16r 205 55" ou "225/70 aro 17") e os passos anteriores nao se aplicam? Se sim -> CAT_A (preencha quantidade_extraida se ele disse quantos pneus).',
  '6. So informa uma quantidade de pneus (numero de unidades), sem medida nova? Se sim -> CAT_C.',
  '7. Pergunta diretamente se o pneu e remold, recauchutado, recapado — OU desconfia/insinua isso de forma indireta, mesmo sem citar a palavra "remold" (ex.: "por que e tao barato?", "e original mesmo?", "e pneu de verdade?") — ou dizer que nao quer remold? Se sim -> CAT_G. (Perguntar so se o pneu e NOVO / meia-vida, sem citar remold/recauchutado/recapado, NAO e CAT_G: e o passo 7b.) Isso vale mesmo que a mensagem tambem cite preco ou a palavra "chines" (ex.: "por que e tao barato, e chines?" e sobre desconfianca de procedencia, nao so preco) — a desconfianca sobre remold/procedencia sempre vence e vira CAT_G, nunca CAT_B, CAT_E nem CAT_L.',
  '7b. Pergunta se o pneu e NOVO, se so tem pneu novo, ou se tem "meia-vida" / usado / seminovo, SEM citar as palavras remold, recauchutado ou recapado (ex.: "e novo?", "tem meia vida ou so pneus novos?", "pneu novo ou usado?")? Se sim -> CAT_W. Se a mesma mensagem citar remold/recauchutado/recapado, vale o passo 7 (CAT_G).',
  '7c. Pergunta se o pneu e NACIONAL, fabricado no Brasil, importado, ou de onde ele vem (origem)? Se sim -> CAT_Z (mesmo que cite "chines" junto, ex.: "e nacional ou chines?").',
  '8. Pergunta EXPLICITAMENTE se o pneu e chines / de origem chinesa, sem nenhuma pergunta sobre remold, sobre por que e barato ou sobre ser nacional/importado? Se sim -> CAT_L.',
  '9. Pergunta se PARCELA / se da pra parcelar, sem citar quantas vezes? Se sim -> CAT_H.',
  '10. Oferece o pneu usado dele como parte do pagamento / base de troca / trocar o velho por novo? Se sim -> CAT_M.',
  '11. Quer vender o pneu usado dele pra loja, ou pergunta se a loja compra pneu usado? Se sim -> CAT_N.',
  '12. Pergunta sobre nota fiscal? Se sim -> CAT_O.',
  '13. Pergunta sobre balanceamento (se faz, quanto custa)? Se sim -> CAT_P (preencha quantidade_extraida se citou quantos pneus/rodas).',
  '14. Pergunta sobre alinhamento (se faz, quanto custa)? Se sim -> CAT_Q.',
  '15. Pede o endereco / a localizacao da loja / onde fica / pede pra mandar a localizacao? Se sim -> CAT_R.',
  '15b. Pergunta o horario de funcionamento / se a loja esta aberta agora / ate que horas atende? Se sim -> CAT_U.',
  '15c. Pede foto ou imagem do pneu (ou pede pra ver o pneu por foto)? Se sim -> CAT_V.',
  '15d. Pergunta sobre a GARANTIA do pneu (se tem, de quanto tempo ou quantos km, como funciona) ou quantos km / quanto tempo o pneu dura ou roda, SEM desconfiar de remold? Se sim -> CAT_AB.',
  '16. Pergunta se a loja TEM ou trabalha com OUTRA marca de pneu (cita Pirelli, Dunlop, Michelin, Goodyear, Bridgestone... ou pergunta por "outras marcas")? Se sim -> CAT_T.',
  '17. Reclama que o preco esta caro, diz que achou mais barato em outro lugar, ou desqualifica a marca/qualidade, SEM fazer uma pergunta concreta nova? Se sim -> CAT_S.',
  '18. Cita ou pergunta EXPLICITAMENTE sobre uma caracteristica tecnica CONCRETA do produto, SEM nenhuma relacao com remold/procedencia — algo como capacidade de carga em kg, durabilidade, garantia, material, resistencia? So marque este passo se essa caracteristica especifica realmente aparecer (nao vale so "a mensagem e curta" ou "nao tem produto citado" — isso sozinho NAO conta como caracteristica tecnica). Se bateu -> CAT_E.',
  '19. Pergunta sobre preco/valor de qualquer forma — inclusive perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", MESMO sem citar produto, medida ou qualquer outro detalhe? Se sim -> CAT_B. Isso e o resultado padrao pra pergunta de preco pura e sem contexto — se o assunto tivesse desconfianca sobre remold/procedencia ou uma caracteristica tecnica concreta, os passos anteriores ja teriam capturado antes de chegar aqui.',
  '19b. A mensagem SO agradece, confirma que entendeu, se despede, diz que vai pensar / decidir depois ou que nao tem mais interesse, sem pedir nem perguntar nada (ex.: "ok obrigado", "blz", "valeu", "entendi", "combinado", "vou pensar e te falo", "sem interesse", "desisti", "ja comprei")? Se sim -> CAT_X.',
  '19c. As mensagens SO cumprimentam, so respondem a um cumprimento (ex.: "tudo bem, graças a Deus", "tudo otimo e voce?") e/ou sao so a legenda do anuncio (nada mais)? Se sim -> CAT_AA.',
  '20. Nenhum passo bateu -> CAT_F (saudacao, reclamacao que nao e de preco/marca, papo solto, informacao sobre a situacao dele, etc.).',
  'Exemplos de saida correta (formato exato esperado):',
  'Mensagem "quanto custa?", contexto vazio -> ' + SAIDA(ITEM('CAT_B')),
  'Mensagem "qual o valor?", contexto vazio -> ' + SAIDA(ITEM('CAT_B')),
  'Mensagem "Ele aguenta até quantos kg", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_E')),
  'Mensagem "é remold isso?", contexto vazio -> ' + SAIDA(ITEM('CAT_G')),
  'Mensagem "por que é tão barato, é chinês?", contexto vazio -> ' + SAIDA(ITEM('CAT_G')),
  'Mensagem "isso é pneu chinês?", contexto vazio -> ' + SAIDA(ITEM('CAT_L')),
  'Mensagem "tem somente novos dele?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_W')),
  'Mensagem "mas tem meia vida ou somente pneus novos?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_W')),
  'Mensagem "esse pneu e remold ou novo?", contexto vazio -> ' + SAIDA(ITEM('CAT_G')),
  'Mensagem "não amigo, remold tô fora", contexto com explicacao de remold ja dada -> ' + SAIDA(ITEM('CAT_G')),
  'Mensagem "quanto fica em 6x?", contexto com preco ja dado -> ' + SAIDA(ITEM_COM('CAT_I', { parcelas_extraida: 6 })),
  'Mensagem "parcela?", contexto vazio -> ' + SAIDA(ITEM('CAT_H')),
  'Mensagem "é sem juros?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_J')),
  'Mensagem "no pix tem desconto?", contexto com preco ja dado -> ' + SAIDA(ITEM_COM('CAT_K', { forma_pagamento_extraida: 'pix' })),
  'Mensagem "faz balanceamento? sao 4 pneus", contexto vazio -> ' + SAIDA(ITEM_COM('CAT_P', { quantidade_extraida: 4 })),
  'Mensagem "onde fica a loja?", contexto vazio -> ' + SAIDA(ITEM('CAT_R')),
  'Mensagem "ta aberto agora?", contexto vazio -> ' + SAIDA(ITEM('CAT_U')),
  'Mensagem "foto", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_V')),
  'Mensagem "achei caro, essa marca nao presta", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_S')),
  'Mensagens 1) "quanto e 2 pneus 175/70/14, pirelli ou dunlop?" 2) "vc tem esses ai" 3) "moro em Alexania, vou buscar" 4) "qual o endereco da loja" -> ' + SAIDA(ITEM_COM('CAT_A', { medida_extraida: '175/70/14', quantidade_extraida: 2 }), ITEM('CAT_T'), ITEM('CAT_R')),
  'Mensagens 1) "boa tarde" 2) "quanto custa o 195/55/15?" 3) "e em 6x?" -> ' + SAIDA(ITEM_COM('CAT_A', { medida_extraida: '195/55/15' }), ITEM_COM('CAT_I', { parcelas_extraida: 6 })),
  'Mensagens 1) "oi" 2) "tudo bem?" -> ' + SAIDA(ITEM('CAT_AA')),
  'Mensagem "📢 [Anúncio] Pneus a partir de R$ 239 Olá! Posso ter mais informações sobre isso?", contexto vazio -> ' + SAIDA(ITEM('CAT_AA')),
  'Mensagem "Sou o João, da importadora de pneus X de Curitiba. Estou a disposicao pra suas cotacoes futuras de pneus.", contexto vazio -> ' + SAIDA(ITEM('CAT_Y')),
  'Mensagem "PNEUS DE GWT 175/70 13 APLUS 189,56 185/60 14 APLUS 216,56 205/55 16 DOUBLESTAR 259,79 FRETE GRATIS ACIMA DE 4000,00", contexto vazio -> ' + SAIDA(ITEM('CAT_Y')),
  'Mensagem "vi mais barato em outra loja, 199 o 175/70/14", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_S')),
  'Mensagem "esse pneu é nacional?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_Z')),
  'Mensagem "qual a garantia desse pneu?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AB')),
  'Mensagem "tem garantia?", contexto vazio -> ' + SAIDA(ITEM('CAT_AB')),
  'Mensagem "essa promocao compre 3 leve 4 ainda vale?", contexto vazio -> ' + SAIDA(ITEM('CAT_AC')),
  'Mensagem "o leve 4 pague 3 e pra qual medida?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AC')),
  'Mensagem "quantos km roda esse pneu?", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_AB')),
  'Mensagem "sem interesse", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_X')),
  'Mensagem "ok obrigado", contexto com preco/endereco ja dado -> ' + SAIDA(ITEM('CAT_X')),
  'Mensagens 1) "blz" 2) "obrigado" -> ' + SAIDA(ITEM('CAT_X')),
  'Mensagem "vou pensar e te falo", contexto com preco ja dado -> ' + SAIDA(ITEM('CAT_X')),
  'Mensagem "ok, e em 6x fica quanto?", contexto com preco ja dado -> ' + SAIDA(ITEM_COM('CAT_I', { parcelas_extraida: 6 })),
  'Mensagens 1) "quanto e o 195/55/15?" 2) "obrigado" -> ' + SAIDA(ITEM_COM('CAT_A', { medida_extraida: '195/55/15' })),
  'Contexto ja respondido: CLIENTE: onde fica a loja? / ROBO: Segue a nossa localizacao. / CLIENTE: quanto custa o 195/55/15? / ROBO: R$ 289,00 a vista. Mensagem a classificar: "e em 6x fica quanto?" -> ' + SAIDA(ITEM_COM('CAT_I', { parcelas_extraida: 6 })),
  'NUNCA calcule nem mencione preco — isso nao e sua tarefa, so classifique e extraia.',
].join('\n');

function converterItem(bruto: any): IntencaoExtraida | null {
  const intencaoReal = CODIGO_PARA_INTENCAO[bruto?.intencao];
  if (!intencaoReal) return null;
  const forma = typeof bruto.forma_pagamento_extraida === 'string' ? bruto.forma_pagamento_extraida.trim().toLowerCase() : '';
  return {
    intencao: intencaoReal,
    medidaExtraida: typeof bruto.medida_extraida === 'string' ? bruto.medida_extraida : null,
    quantidadeExtraida: typeof bruto.quantidade_extraida === 'number' ? bruto.quantidade_extraida : null,
    escolhaAlternativa: typeof bruto.escolha_alternativa === 'string' ? bruto.escolha_alternativa : null,
    parcelasExtraida: typeof bruto.parcelas_extraida === 'number' ? bruto.parcelas_extraida : null,
    formaPagamentoExtraida: forma === 'dinheiro' || forma === 'pix' ? forma : null,
  };
}

/**
 * Le as mensagens ainda sem resposta do cliente (uma ou varias, na ordem em que chegaram)
 * e devolve a lista de assuntos. null = falha (o chamador cai na IA livre, fail-safe).
 */
export async function extrairIntencoesPreco(
  mensagens: string[],
  contextoRecente: string,
  apiKey: string
): Promise<IntencaoExtraida[] | null> {
  try {
    const lista = mensagens.map((m) => String(m).slice(0, 500));
    const bloco = lista.length === 1
      ? `MENSAGEM DO CLIENTE A CLASSIFICAR:\n${lista[0]}`
      : `MENSAGENS DO CLIENTE A CLASSIFICAR (na ordem em que chegaram, todas ainda sem resposta):\n${lista.map((m, i) => `${i + 1}) ${m}`).join('\n')}`;
    const textoUsuario = `Contexto recente da conversa, JA RESPONDIDO — serve so pra entender referencias, NAO classifique nada daqui (mais antiga primeiro):\n${contextoRecente.slice(0, 1500) || '(vazio)'}\n\n${bloco}`;
    // Provedor Anthropic (chave sk-ant-): saida estruturada por tool use forcado, temperatura 0.
    if (ehChaveAnthropic(apiKey)) {
      const saida = await extrairEstruturadoAnthropic({
        apiKey,
        model: process.env.ANTHROPIC_MODEL_EXTRATOR || 'claude-haiku-5-5',
        system: INSTRUCAO,
        usuario: textoUsuario,
        schema: SCHEMA_EXTRACAO,
        nomeFerramenta: 'registrar_extracao',
      });
      const itensAnt = converterSaida(saida);
      // SO_AGRADECIMENTO_COM_PERGUNTA: agradecimento + pergunta na mesma frase; a pergunta vale.
      if (itensAnt && itensAnt.length === 1 && itensAnt[0]?.intencao === 'AGRADECEU_OU_ENCERROU' && lista.some((m) => m.includes('?'))) {
        const semAgradecer = lista.map((m) => m.replace(/^\s*((muito\s+)?obrigad[oa]s?|brigad[oa]|valeu|vlw|blz|beleza|ok|show|top|certo|entendi)[\s,.!;:-]*/i, '').trim()).filter(Boolean);
        if (semAgradecer.join(' ') !== lista.join(' ')) {
          const bloco2 = semAgradecer.length === 1
            ? `MENSAGEM DO CLIENTE A CLASSIFICAR:\n${semAgradecer[0]}`
            : `MENSAGENS DO CLIENTE A CLASSIFICAR (na ordem em que chegaram, todas ainda sem resposta):\n${semAgradecer.map((m, i) => `${i + 1}) ${m}`).join('\n')}`;
          const saida2 = await extrairEstruturadoAnthropic({
            apiKey,
            model: process.env.ANTHROPIC_MODEL_EXTRATOR || 'claude-haiku-5-5',
            system: INSTRUCAO,
            usuario: bloco2, // sem o contexto: com ele o modelo insistia em "agradecimento"
            schema: SCHEMA_EXTRACAO,
            nomeFerramenta: 'registrar_extracao',
          });
          const itens2 = converterSaida(saida2);
          if (itens2 && itens2.some((i) => i.intencao !== 'AGRADECEU_OU_ENCERROU')) return itens2;
        }
      }
      return itensAnt;
    }
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    // Esforco de raciocinio: classificar mensagem nao precisa "pensar" — medido em 18/09 com a rajada
    // real: padrao do modelo = 3-18s por chamada; minimal = 1-2s, mesma precisao. Configuravel por env
    // (FLUXO_EXTRATOR_EFFORT = minimal|low|medium|high|padrao; "padrao" nao manda o parametro).
    const esforco = (process.env.FLUXO_EXTRATOR_EFFORT || 'minimal').trim().toLowerCase();
    const chamar = (comEsforco: boolean) => fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        ...(comEsforco && esforco !== 'padrao' ? { reasoning: { effort: esforco } } : {}),
        input: [
          { role: 'system', content: [{ type: 'input_text', text: INSTRUCAO }] },
          { role: 'user', content: [{ type: 'input_text', text: textoUsuario }] },
        ],
        text: { format: { type: 'json_schema', name: 'extracao_preco', strict: true, schema: SCHEMA_EXTRACAO } },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    let resp = await chamar(true);
    // Modelo que nao aceita o parametro de raciocinio (OPENAI_MODEL trocado): tenta de novo sem ele.
    if (resp.status === 400 && esforco !== 'padrao') {
      const erro: any = await resp.clone().json().catch(() => null);
      if (/reasoning|effort/i.test(String(erro?.error?.message || ''))) resp = await chamar(false);
    }
    const body: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[FluxoPreco][Extrator] Falha na API:', resp.status, body?.error?.message);
      return null;
    }
    return converterSaida(extrairTextoJson(body));
  } catch (e: any) {
    console.error('[FluxoPreco][Extrator] Erro:', e?.message || e);
    return null; // falha = trata como OUTRO_ASSUNTO no chamador (fail-safe, nunca trava o cliente)
  }
}

function converterSaida(textoSaida: string | null): IntencaoExtraida[] | null {
  if (!textoSaida) return null;
  const parsed = JSON.parse(textoSaida);
  if (!Array.isArray(parsed?.itens)) return null;
  const itens = parsed.itens.map(converterItem).filter((i: IntencaoExtraida | null): i is IntencaoExtraida => !!i);
  return itens.length ? itens : null;
}

// Uma mensagem so -> o 1o assunto (mantido pros testes de classificacao de mensagem unica).
export async function extrairIntencaoPreco(
  mensagemAtual: string,
  contextoRecente: string,
  apiKey: string
): Promise<IntencaoExtraida | null> {
  const itens = await extrairIntencoesPreco([mensagemAtual], contextoRecente, apiKey);
  return itens ? itens[0] ?? null : null;
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
  // balanceamento, alinhamento, endereco/localizacao, objecao de preco/marca, outra marca.
  if (/juro|desconto|dinheiro|\bpix\b|cart[aã]o|cr[eé]dito|d[eé]bito|troca|usado|nota fiscal|\bnf\b|balancea|alinha|localiza|endere[cç]o|onde (fica|[eé]|voc)|\bmapa\b|\bcaro\b|barato|n[aã]o presta|marca|pirelli|dunlop|michelin|goodyear|bridgestone|continental|firestone|yokohama|\bnovos?\b|meia.?vida|seminov|\bfotos?\b|imagem|hor[aá]rio|aberto|aberta|\babre\b|\bfecha|funcion|atende|expediente/.test(t)) return true;
  // Agradecimento/despedida/"vou pensar" (21/09): tambem chega "frio" (sem numero nem palavra de preco).
  if (/obrigad|brigad|valeu|vlw|agradec|\btchau\b|at[eé] (mais|logo)|\bblz\b|beleza|\bok\b|combinado|entendi|vou pensar|depois eu (vejo|falo)|\bfalou\b|\bflw\b/.test(t)) return true;
  return false;
}
