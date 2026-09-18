import { IntencaoExtraida, IntencaoTipo } from './fluxoPreco';

// CAMADA 1 do fluxo deterministico de preco (10/09). Unica funcao desta feature
// que fala com a OpenAI. So EXTRAI o que o cliente quis dizer, em formulario
// fixo (json_schema estrito) — nunca decide o que responder, nunca gera preco.
// Ver docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md.

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
// descritivos sem re-testar — o bug volta.
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
};

const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: {
    intencao: {
      type: 'string',
      enum: ['CAT_A', 'CAT_B', 'CAT_C', 'CAT_D', 'CAT_E', 'CAT_F', 'CAT_G'],
      description: 'CAT_A = cliente informou a medida do pneu nesta mensagem (mesmo em formato estranho, tipo "16r 205 55" ou "225/70 aro 17"). CAT_B = pergunta de preco/valor SEM informar a medida nesta mensagem — inclui perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", mesmo sem citar produto, medida ou qualquer outro detalhe; uma pergunta assim, pura e sem mais nada, e SEMPRE CAT_B — MAS se a mensagem tambem desconfiar/perguntar sobre remold/procedencia, e CAT_G, nao CAT_B. CAT_C = informou quantos pneus quer (numero de unidades), sem dar medida nova. CAT_D = esta escolhendo uma das opcoes de medida que JA foram oferecidas antes (contexto da conversa), mesmo so repetindo a medida escolhida. CAT_E = pergunta sobre uma caracteristica tecnica CONCRETA do produto que NAO e preco e NAO e sobre remold/procedencia — exige que a mensagem cite algo especifico tipo capacidade de carga em kg, durabilidade, garantia, material ou resistencia; sem essa caracteristica citada explicitamente, NUNCA e CAT_E, mesmo que a mensagem seja curta ou sem contexto. CAT_F = qualquer outra coisa (saudacao, agradecimento, pedir endereco, reclamacao, papo solto). CAT_G = o cliente pergunta diretamente se o pneu e remold, recauchutado, recapado ou usado, OU desconfia/insinua isso de forma indireta (ex.: "por que e tao barato?", "isso e chines?", "e original mesmo?"), mesmo sem usar a palavra "remold" — isso e SEMPRE CAT_G, nunca CAT_E (que e so sobre capacidade/durabilidade/peso, sem nenhuma relacao com origem/procedencia do pneu) nem CAT_B (pergunta de preco pura, sem nenhuma desconfianca sobre remold/procedencia).',
    },
    medida_extraida: {
      type: ['string', 'null'],
      description: 'Medida do pneu no formato EXATO "LARGURA/PERFIL/ARO" (ex.: "205/55/16"), so quando o cliente deu uma medida completa nesta mensagem — normalize qualquer ordem/separador (ex.: "16r 205 55" ou "225/70 aro 17" viram "225/70/17"). null se nao houver medida completa nesta mensagem.',
    },
    quantidade_extraida: {
      type: ['integer', 'null'],
      description: 'Quantidade de pneus mencionada nesta mensagem (ex.: "preciso de 4" = 4). null se nao mencionou.',
    },
    escolha_alternativa: {
      type: ['string', 'null'],
      description: 'Se o cliente esta escolhendo uma das medidas alternativas que JA foram oferecidas a ele (contexto anterior), a medida escolhida no formato LARGURA/PERFIL/ARO. null se nao se aplica.',
    },
  },
  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa'],
  additionalProperties: false,
};

// IMPORTANTE: este texto NAO cita os nomes reais das intencoes (DAR_MEDIDA,
// PERGUNTA_TECNICA etc.) de proposito — so os codigos neutros CAT_A..CAT_G,
// que sao os mesmos usados no enum do schema. Ver comentario grande acima de
// SCHEMA_EXTRACAO: citar os nomes descritivos aqui (mesmo so como explicacao,
// sem serem o valor de saida) nao foi testado e e mais seguro evitar.
const INSTRUCAO = [
  'Voce classifica UMA mensagem de cliente de uma loja de pneus, pra um sistema que decide a resposta certa, usando os codigos CAT_A..CAT_G descritos no schema.',
  'Siga esta ORDEM de verificacao e pare no PRIMEIRO item que bater — nao pule direto pra CAT_E nem trate falta de contexto como motivo pra escolher ela:',
  '1. Existe uma lista de alternativas de medida JA oferecida no contexto da conversa (mensagem anterior do robo oferecendo mais de uma opcao), e nesta mensagem o cliente esta escolhendo uma delas — mesmo so repetindo a medida escolhida, tipo "pode ser essa de 205/55/17" ou so "205/55/17"? Se sim -> CAT_D (mesmo a mensagem contendo uma medida completa).',
  '2. A mensagem contem uma medida completa de pneu (LARGURA/PERFIL/ARO, em qualquer formato/ordem, ex.: "16r 205 55" ou "225/70 aro 17") e o item anterior nao se aplica? Se sim -> CAT_A.',
  '3. A mensagem so informa uma quantidade de pneus (numero de unidades), sem medida nova? Se sim -> CAT_C.',
  '4. A mensagem pergunta diretamente se o pneu e remold, recauchutado, recapado, ou usado — OU desconfia/insinua isso de forma indireta, mesmo sem citar a palavra "remold" (ex.: "por que e tao barato?", "isso e chines?", "e original mesmo?", "e pneu de verdade?")? Se sim -> CAT_G. Isso vale mesmo que a mensagem tambem cite preco (ex.: "por que e tao barato?" e sobre desconfianca de procedencia, nao so preco) — a desconfianca sobre remold/procedencia sempre vence e vira CAT_G, nunca CAT_B nem CAT_E.',
  '5. A mensagem cita ou pergunta EXPLICITAMENTE sobre uma caracteristica tecnica CONCRETA do produto, SEM nenhuma relacao com remold/procedencia — algo como capacidade de carga em kg, durabilidade, garantia, material, resistencia? So marque este item se essa caracteristica especifica realmente aparecer na mensagem (nao vale so "a mensagem e curta" ou "nao tem produto citado" — isso sozinho NAO conta como caracteristica tecnica). Se bateu -> CAT_E.',
  '6. A mensagem pergunta sobre preco/valor de qualquer forma — inclusive perguntas curtas e genericas tipo "quanto custa?", "qual o valor?", "quanto e?", "quanto fica?", "quanto ta?", "tem preco?", MESMO sem citar produto, medida ou qualquer outro detalhe? Se sim -> CAT_B. Isso e o resultado padrao pra pergunta de preco pura e sem contexto — se a mensagem tivesse desconfianca sobre remold/procedencia ou uma caracteristica tecnica concreta, os itens 4 e 5 ja teriam capturado antes de chegar aqui.',
  '7. Nenhum item acima bateu -> CAT_F (saudacao, agradecimento, pedir endereco, reclamacao, papo solto, etc.).',
  'Exemplos de saida correta (formato exato esperado):',
  'Mensagem "quanto custa?", contexto vazio -> {"intencao":"CAT_B","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null}',
  'Mensagem "qual o valor?", contexto vazio -> {"intencao":"CAT_B","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null}',
  'Mensagem "Ele aguenta até quantos kg", contexto com preco ja dado -> {"intencao":"CAT_E","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null}',
  'Mensagem "é remold isso?", contexto vazio -> {"intencao":"CAT_G","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null}',
  'Mensagem "por que é tão barato, é chinês?", contexto vazio -> {"intencao":"CAT_G","medida_extraida":null,"quantidade_extraida":null,"escolha_alternativa":null}',
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
    return {
      intencao: intencaoReal,
      medidaExtraida: typeof parsed.medida_extraida === 'string' ? parsed.medida_extraida : null,
      quantidadeExtraida: typeof parsed.quantidade_extraida === 'number' ? parsed.quantidade_extraida : null,
      escolhaAlternativa: typeof parsed.escolha_alternativa === 'string' ? parsed.escolha_alternativa : null,
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
// So retorna false quando tem certeza que NAO e sobre preco/medida — na duvida,
// deixa passar pro extrator decidir (ele e mais confiavel que regex).
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
  return false;
}
