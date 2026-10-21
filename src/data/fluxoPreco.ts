import { ItemPreco, encontrarPrecosExatosPorMedida, alternativasMesmoAro, montarPartesPreco, montarPartesDescontoAVista, brl } from './tabelaPrecos';
import { TextosFluxo, textoFluxo, preencherPlaceholders, VARIANTE_REPETICAO, aplicarAudioFluxo } from './fluxoCatalogo';

// FLUXO DETERMINISTICO DE MEDIDA/PRECO (10/09).
//
// Substitui a decisao livre da IA por: codigo consulta a tabela de precos de
// verdade e decide a acao. A IA (fluxoPrecoExtrator.ts) so entra pra ENTENDER a
// mensagem do cliente (formulario fixo, nunca texto livre) — nunca pra decidir
// o que responder nem pra gerar numero. Ver design em
// docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md e
// docs/superpowers/specs/2026-09-18-fluxo-atendimento-completo-design.md.
//
// Os TEXTOS FIXOS de cada resposta ficam em fluxoCatalogo.ts (texto padrao) e podem ser
// editados pelo dono na tela "Fluxo" do painel (tabela FluxoResposta): esta funcao recebe
// os textos editados em `textos` (mapa chave -> bolhas) e usa o padrao quando nao ha edicao.
// Continua PURA: sem I/O, sem IA.
//
// REGRA DE ESCRITA de todo texto fixo: sempre a voz direta do vendedor falando com o
// cliente — nunca meta-comentario nem "sugestao pra copiar e enviar" (incidente real da
// Josy, 17/09, quando um texto nesse formato foi parar direto na conversa).

export type EstadoPrecoFluxo = 'sem_estado' | 'aguardando_medida' | 'medida_sem_match' | 'preco_confirmado';

// Pergunta que o cliente fez ANTES de dar a medida (parcelamento em N vezes ou desconto
// a vista): guardada pra responder ELA quando a medida chegar, em vez de so devolver o
// preco a vista e fazer o cliente repetir a pergunta.
export type PedidoEspecifico =
  | { tipo: 'parcelamento_especifico'; parcelas: number }
  | { tipo: 'desconto_avista' };

export interface DadosPrecoFluxo {
  medida?: string;
  aroSemMatch?: string;
  // Quantidade de pneus ja dita pelo cliente nesta conversa (senao "e em 6x?" depois de
  // cotar 4 pneus respondia o parcelamento de 1 so).
  quantidade?: number;
  intencaoPendente?: 'parcelamento_especifico' | 'desconto_avista';
  parcelasPendentes?: number;
}

export type IntencaoTipo =
  | 'DAR_MEDIDA'
  | 'PERGUNTAR_PRECO_SEM_MEDIDA'
  | 'RESPONDER_QUANTIDADE'
  | 'ESCOLHER_ALTERNATIVA'
  | 'PERGUNTA_TECNICA'
  | 'PERGUNTOU_SE_E_REMOLD'
  | 'PERGUNTOU_PARCELAMENTO_GENERICO'
  | 'PERGUNTOU_PARCELAMENTO_ESPECIFICO'
  | 'PERGUNTOU_SE_TEM_JUROS'
  | 'PERGUNTOU_DESCONTO_AVISTA'
  | 'PERGUNTOU_SE_E_CHINES'
  | 'PERGUNTOU_SE_E_NOVO'
  | 'PERGUNTOU_POR_OUTRA_MARCA'
  | 'OFERECEU_BASE_TROCA'
  | 'OFERECEU_VENDER_USADO'
  | 'PERGUNTOU_NOTA_FISCAL'
  | 'PERGUNTOU_BALANCEAMENTO'
  | 'PERGUNTOU_ALINHAMENTO'
  | 'PEDIU_LOCALIZACAO'
  | 'PERGUNTOU_HORARIO'
  | 'PEDIU_FOTO'
  | 'OBJETOU_PRECO_OU_MARCA'
  | 'AGRADECEU_OU_ENCERROU'
  | 'OFERTA_DE_FORNECEDOR'
  | 'PERGUNTOU_SE_E_NACIONAL'
  | 'PERGUNTOU_GARANTIA'
  | 'PERGUNTOU_PROMOCAO_LEVE4'
  | 'PERGUNTOU_SERVICO_OFICINA'
  | 'VAI_VIR_NA_LOJA'
  | 'SO_SAUDACAO'
  | 'OUTRO_ASSUNTO';

export interface IntencaoExtraida {
  intencao: IntencaoTipo;
  medidaExtraida: string | null;
  quantidadeExtraida: number | null;
  escolhaAlternativa: string | null;
  parcelasExtraida?: number | null;
  formaPagamentoExtraida?: 'dinheiro' | 'pix' | null;
  // Dia que o cliente disse que vem na loja ('hoje', 'amanha', 'sabado', '25', '25/10'...). Ver data/visita.ts.
  diaVisita?: string | null;
}

// Acoes cujo texto e 100% fixo (ou calculado direto da tabela) — o chamador so manda as partes.
export type TipoAcaoTexto =
  | 'RESPONDER_REMOLD'
  | 'RESPONDER_PARCELAMENTO_GENERICO'
  | 'RESPONDER_PARCELAMENTO_ESPECIFICO'
  | 'RESPONDER_JUROS'
  | 'RESPONDER_DESCONTO'
  | 'RESPONDER_CHINES'
  | 'RESPONDER_BASE_TROCA'
  | 'RESPONDER_COMPRA_USADO'
  | 'RESPONDER_NOTA_FISCAL'
  | 'RESPONDER_BALANCEAMENTO'
  | 'RESPONDER_ALINHAMENTO'
  | 'RESPONDER_OBJECAO'
  | 'RESPONDER_LOCALIZACAO_REPETIDA'
  | 'RESPONDER_OUTRA_MARCA'
  | 'RESPONDER_CONDICAO'
  | 'RESPONDER_HORARIO'
  | 'RESPONDER_FOTO'
  | 'RESPONDER_AGRADECIMENTO'
  | 'RESPONDER_NACIONAL'
  | 'RESPONDER_GARANTIA'
  | 'RESPONDER_PROMOCAO_LEVE4'
  | 'RESPONDER_SERVICO_OFICINA'
  | 'CONFIRMAR_VISITA'
  | 'RESPONDER_SAUDACAO'
  // O robo decidiu NAO responder (ex.: agradecimento repetido). E uma decisao do codigo, nao "sai do fluxo":
  // a IA livre tambem NAO responde — partes vem vazio.
  | 'SILENCIO'
  // Manda o texto E o chamador (botAtendimentoService) dispara o pino de localizacao real.
  | 'ENVIAR_LOCALIZACAO_FIXA';

export type AcaoPreco =
  | { tipo: 'PEDIR_MEDIDA'; partes: string[] }
  | { tipo: 'CONFIRMAR_PRECO'; partes: string[] }
  | { tipo: 'OFERECER_ALTERNATIVAS'; partes: string[] }
  | { tipo: TipoAcaoTexto; partes: string[] }
  | { tipo: 'NADA' }; // sai do fluxo — cai no caminho de IA livre de hoje

export interface ResultadoDecisao {
  acao: AcaoPreco;
  novoEstado: EstadoPrecoFluxo;
  novosDados: DadosPrecoFluxo;
  // Blocos do fluxo (chaves do catalogo, ex.: 'remold_insistencia', 'preco_medida') que produziram esta
  // resposta. Alimenta o fluxograma ao vivo do painel: mostra POR ONDE a mensagem do cliente passou.
  chaves?: string[];
}

// Fatos da conversa que quem tem banco (botAtendimentoService) sabe e este motor puro nao.
export interface ContextoFluxo {
  // Ha quantos minutos o pino de localizacao foi mandado nesta conversa (robo ou atendente),
  // olhando ate 12h atras; null/ausente = ainda nao foi mandado.
  minutosDesdeLocalizacao?: number | null;
  // Chaves de resposta (e variantes) cujo texto o robo JA mandou ha pouco nesta conversa
  // (ver chavesJaRespondidas em fluxoCatalogo.ts). Evita repetir a mesma explicacao palavra por palavra.
  jaRespondidas?: string[];
  // A loja (robo ou atendente) falou ha pouco (< 4h)? false = o cliente esta voltando depois de um tempo;
  // ausente = nao informado (vale como "ha pouco", comportamento antigo).
  lojaFalouHaPouco?: boolean;
}

// Texto da resposta, trocando pela variante quando o robo ja disse o mesmo ha pouco. null = ja disse a
// versao normal E a variante: nao repete de novo, sai do fluxo (a IA livre, com as travas, segue a conversa).
function textoSemRepetir(textos: TextosFluxo, chave: string, contexto: ContextoFluxo): { chave: string; partes: string[] } | null {
  const variante = VARIANTE_REPETICAO[chave];
  const ja = contexto.jaRespondidas || [];
  if (variante && ja.includes(chave)) return ja.includes(variante) ? null : { chave: variante, partes: textoFluxo(textos, variante) };
  return { chave, partes: textoFluxo(textos, chave) };
}

// Pediu o endereco de novo dentro dessa janela: responde so em texto, nao manda o pino outra vez
// (achado 18/09, caso Marcia Lima: 3 pinos em 5 minutos).
const JANELA_PINO_REPETIDO_MIN = 30;

// Marcador que o motor coloca DENTRO das partes, na posicao exata em que o pino da loja tem que
// sair (depois do texto "Segue a nossa localizacao"). Quem envia (botAtendimentoService) troca
// pelo envio real do pino. Fica em `partes` pra manter a ORDEM certa numa resposta com varios assuntos.
export const MARCADOR_PINO = '[ENVIAR_LOCALIZACAO]';

export const VALOR_BALANCEAMENTO_POR_RODA = 25;
export const PARCELAS_MAXIMAS = 10;

function dadosComQuantidade(dados: DadosPrecoFluxo, quantidade: number | null): DadosPrecoFluxo {
  return quantidade && quantidade > 0 ? { ...dados, quantidade } : dados;
}

// Quantidade que vale pra medida em questao: a dita agora, senao a ja guardada — MAS se o
// cliente esta cotando uma medida DIFERENTE da ja confirmada, a quantidade guardada era
// de outro pneu e nao vale (nao cotar "os 4 pneus" da medida nova sem ele ter dito).
function quantidadeAplicavel(intencao: IntencaoExtraida, estadoAtual: EstadoPrecoFluxo, dadosAtuais: DadosPrecoFluxo, medidaUsada: string | null | undefined): number | null {
  if (intencao.quantidadeExtraida) return intencao.quantidadeExtraida;
  if (estadoAtual === 'preco_confirmado' && dadosAtuais.medida && medidaUsada && medidaUsada !== dadosAtuais.medida) return null;
  return dadosAtuais.quantidade ?? null;
}

function respostaTexto(tipo: TipoAcaoTexto, partes: string[], estadoAtual: EstadoPrecoFluxo, dadosAtuais: DadosPrecoFluxo, chave: string): ResultadoDecisao {
  // Se o catalogo tem AUDIO pra essa chave (gravacao do dono), o marcador entra nas partes (ver aplicarAudioFluxo).
  return { acao: { tipo, partes: aplicarAudioFluxo(chave, partes) }, novoEstado: estadoAtual, novosDados: dadosAtuais, chaves: [chave] };
}

const SAI_DO_FLUXO = (estadoAtual: EstadoPrecoFluxo, dadosAtuais: DadosPrecoFluxo): ResultadoDecisao =>
  ({ acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais, chaves: [] });

function pedirMedida(estadoAtual: EstadoPrecoFluxo, dadosAtuais: DadosPrecoFluxo, textos: TextosFluxo, contexto: ContextoFluxo, pedido?: PedidoEspecifico): ResultadoDecisao {
  // Ja pediu a medida ha pouco: pede de outro jeito; se ate essa variante ja foi mandada, sai do fluxo
  // (a IA livre, com as travas, segue) em vez de repetir a mesma frase pela 3a vez (21/09, caso Carlos Gomes).
  const texto = textoSemRepetir(textos, 'pedir_medida', contexto);
  if (!texto) return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
  // Reset de medida/aroSemMatch (estado promete recomeco limpo), mas guarda o pedido
  // especifico e a quantidade — sao coisas que o cliente ja disse e nao devem se perder.
  const dados: DadosPrecoFluxo = {};
  if (dadosAtuais.quantidade) dados.quantidade = dadosAtuais.quantidade;
  const tipoPedido = pedido?.tipo ?? dadosAtuais.intencaoPendente;
  if (tipoPedido) dados.intencaoPendente = tipoPedido;
  const parcelas = pedido?.tipo === 'parcelamento_especifico' ? pedido.parcelas : dadosAtuais.parcelasPendentes;
  if (tipoPedido === 'parcelamento_especifico' && parcelas) dados.parcelasPendentes = parcelas;
  return { acao: { tipo: 'PEDIR_MEDIDA', partes: texto.partes }, novoEstado: 'aguardando_medida', novosDados: dados, chaves: [texto.chave] };
}

function pedidoPendente(dados: DadosPrecoFluxo): PedidoEspecifico | undefined {
  if (dados.intencaoPendente === 'desconto_avista') return { tipo: 'desconto_avista' };
  if (dados.intencaoPendente === 'parcelamento_especifico' && dados.parcelasPendentes) {
    return { tipo: 'parcelamento_especifico', parcelas: dados.parcelasPendentes };
  }
  return undefined;
}

// `pedido` = o cliente perguntou parcelamento/desconto (agora, ou antes de dar a medida).
// `comAvista` = inclui a linha do preco a vista antes da resposta especifica (usado quando
// a pergunta ficou pendente: o cliente pode nem lembrar mais que perguntou).
function montarAcaoParaMedida(medida: string, textos: TextosFluxo, quantidade: number | null = null, pedido?: PedidoEspecifico, comAvista = false): ResultadoDecisao {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (itens.length > 0) {
    // Achado 09/09 (SEJA DECISIVO): quando ha mais de um modelo pra mesma medida,
    // pega o primeiro em vez de perguntar — a loja ja escolhe por preco/uso.
    const item: ItemPreco = itens[0]!;
    const novosDados = dadosComQuantidade({ medida: item.medida }, quantidade);
    if (pedido?.tipo === 'parcelamento_especifico') {
      const partes = [...(comAvista ? montarPartesPreco(item, null, quantidade).slice(0, 1) : []), ...montarPartesPreco(item, pedido.parcelas, quantidade)];
      return { acao: { tipo: 'RESPONDER_PARCELAMENTO_ESPECIFICO', partes }, novoEstado: 'preco_confirmado', novosDados, chaves: ['parcelamento_especifico'] };
    }
    if (pedido?.tipo === 'desconto_avista') {
      return { acao: { tipo: 'RESPONDER_DESCONTO', partes: montarPartesDescontoAVista(item, quantidade) }, novoEstado: 'preco_confirmado', novosDados, chaves: ['desconto_dinheiro'] };
    }
    const partes = montarPartesPreco(item, null, quantidade);
    return { acao: { tipo: 'CONFIRMAR_PRECO', partes }, novoEstado: 'preco_confirmado', novosDados, chaves: ['preco_medida'] };
  }
  const aro = medida.split('/')[2] || '';
  const alternativas = alternativasMesmoAro(medida);
  const partesSemMatch = alternativas
    ? [`Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: ${alternativas}. Alguma dessas serve pra você?`]
    : textoFluxo(textos, 'sem_alternativa');
  const dadosSemMatch: DadosPrecoFluxo = {};
  if (alternativas) {
    dadosSemMatch.aroSemMatch = aro;
    if (quantidade && quantidade > 0) dadosSemMatch.quantidade = quantidade;
    if (pedido) {
      dadosSemMatch.intencaoPendente = pedido.tipo;
      if (pedido.tipo === 'parcelamento_especifico') dadosSemMatch.parcelasPendentes = pedido.parcelas;
    }
  }
  const chaveSemMatch = alternativas ? 'medida_inexistente' : 'sem_alternativa';
  return {
    acao: { tipo: 'OFERECER_ALTERNATIVAS', partes: aplicarAudioFluxo(chaveSemMatch, partesSemMatch) },
    novoEstado: alternativas ? 'medida_sem_match' : 'sem_estado',
    novosDados: dadosSemMatch,
    chaves: [chaveSemMatch],
  };
}

export interface ResultadoSequencia {
  acaoPrincipal: AcaoPreco['tipo']; // tipo da 1a acao que respondeu; 'NADA' = sai do fluxo (cai na IA livre)
  partes: string[];
  novoEstado: EstadoPrecoFluxo;
  novosDados: DadosPrecoFluxo;
  // Assuntos que a IA leu na rajada (na ordem) e blocos do fluxo que responderam — pro fluxograma ao vivo.
  assuntos: IntencaoTipo[];
  chaves: string[];
}

const MAX_ASSUNTOS_POR_RAJADA = 4;
const MAX_PARTES_POR_RAJADA = 8;

/**
 * RAJADA (18/09, caso Marcia Lima): o cliente manda varias mensagens seguidas (preco, marca,
 * endereco...) e o robo tem que responder TUDO, na ordem em que ele perguntou — nao so a ultima.
 * A IA extratora devolve a lista de assuntos; aqui o codigo passa por cada um com
 * decidirAcaoPreco, encadeando o estado (a medida dada no 1o assunto vale pro 2o), junta as
 * respostas na ordem e tira bolha repetida. Continua PURO.
 *
 * - Pergunta tecnica no meio da rajada: o codigo nao sabe responder -> sai do fluxo inteiro
 *   (a IA livre, protegida pelas travas, responde a rajada toda).
 * - Assunto sem resposta fixa (papo solto, agradecimento) e ignorado quando ha outro assunto.
 * - O pino da localizacao sai no maximo 1 vez por rajada.
 */
export function decidirSequenciaPreco(
  intencoes: IntencaoExtraida[],
  estadoAtual: EstadoPrecoFluxo,
  dadosAtuais: DadosPrecoFluxo,
  textos: TextosFluxo = {},
  contexto: ContextoFluxo = {}
): ResultadoSequencia {
  const itensLidos = intencoes.slice(0, MAX_ASSUNTOS_POR_RAJADA);
  const assuntos = itensLidos.map((i) => i.intencao);
  const saidaNada: ResultadoSequencia = { acaoPrincipal: 'NADA', partes: [], novoEstado: estadoAtual, novosDados: dadosAtuais, assuntos, chaves: [] };
  if (itensLidos.length === 0) return saidaNada;
  // Fornecedor oferecendo pra loja: nada da rajada é respondido, nem medida/preço que ele citou (23/09).
  if (itensLidos.some((i) => i.intencao === 'OFERTA_DE_FORNECEDOR')) {
    return { acaoPrincipal: 'SILENCIO', partes: [], novoEstado: estadoAtual, novosDados: dadosAtuais, assuntos, chaves: ['fornecedor'] };
  }
  if (itensLidos.some((i) => i.intencao === 'PERGUNTA_TECNICA')) return saidaNada;
  // "Obrigado" junto com um pedido de verdade nao vira resposta propria (a resposta ao pedido ja basta). Junto com
  // so "papo solto" (ex.: "fica na contra mao pra mim" + "obrigado pela atencao") continua sendo um agradecimento.
  // Cumprimento junto de qualquer outra coisa também não vira resposta própria (23/09).
  const soGesto = (t: IntencaoTipo) => t === 'AGRADECEU_OU_ENCERROU' || t === 'SO_SAUDACAO' || t === 'OUTRO_ASSUNTO';
  const haPedidoDeVerdade = itensLidos.some((i) => !soGesto(i.intencao));
  // So cumprimentos ("oi" + "tudo bem?" em 2 mensagens): vira UM cumprimento.
  const naoSaudacao = itensLidos.filter((i) => i.intencao !== 'SO_SAUDACAO');
  const semSaudacao = naoSaudacao.length ? naoSaudacao : itensLidos.slice(0, 1);
  const itens = haPedidoDeVerdade ? semSaudacao.filter((i) => i.intencao !== 'AGRADECEU_OU_ENCERROU') : semSaudacao;

  let estado = estadoAtual;
  let dados = dadosAtuais;
  const partes: string[] = [];
  const chaves: string[] = [];
  let acaoPrincipal: AcaoPreco['tipo'] = 'NADA';
  let pinNaRajada = false;
  let silencio = false;

  for (const item of itens) {
    if (item.intencao === 'PEDIU_LOCALIZACAO' && pinNaRajada) continue;
    const r = decidirAcaoPreco(item, estado, dados, textos, contexto);
    if (r.acao.tipo === 'NADA') continue;
    for (const c of r.chaves || []) if (!chaves.includes(c)) chaves.push(c);
    if (r.acao.tipo === 'SILENCIO') { silencio = true; continue; }
    if (acaoPrincipal === 'NADA') acaoPrincipal = r.acao.tipo;
    if (r.acao.partes.includes(MARCADOR_PINO)) pinNaRajada = true;
    for (const p of r.acao.partes) {
      if (p === MARCADOR_PINO || !partes.includes(p)) partes.push(p);
    }
    estado = r.novoEstado;
    dados = r.novosDados;
  }

  // So havia assunto pra ficar quieto (ex.: agradecimento repetido): o codigo decide o SILENCIO — a IA livre nao responde.
  if (partes.length === 0 && silencio) return { acaoPrincipal: 'SILENCIO', partes: [], novoEstado: estadoAtual, novosDados: dadosAtuais, assuntos, chaves };
  if (acaoPrincipal === 'NADA' || partes.length === 0) return saidaNada;
  return { acaoPrincipal, partes: partes.slice(0, MAX_PARTES_POR_RAJADA), novoEstado: estado, novosDados: dados, assuntos, chaves };
}

/**
 * Motor de decisao PURO — sem I/O, sem IA, 100% testavel sem rede.
 * Recebe a intencao ja extraida (pela IA, em fluxoPrecoExtrator.ts) + o estado
 * salvo da conversa, e devolve a ACAO pronta (com os numeros ja resolvidos pela
 * tabela) + o proximo estado. `textos` = respostas editadas pelo dono (opcional).
 */
export function decidirAcaoPreco(
  intencao: IntencaoExtraida,
  estadoAtual: EstadoPrecoFluxo,
  dadosAtuais: DadosPrecoFluxo,
  textos: TextosFluxo = {},
  contexto: ContextoFluxo = {}
): ResultadoDecisao {
  const quantidadeConhecida = intencao.quantidadeExtraida ?? dadosAtuais.quantidade ?? null;

  // As perguntas abaixo podem vir em QUALQUER ponto da conversa, independente do estado
  // atual, e (salvo as que dependem de medida) nao mexem no estado nem nos dados do fluxo
  // de preco em andamento — mesmo tratamento que PERGUNTA_TECNICA da logo depois.
  switch (intencao.intencao) {
    case 'PERGUNTOU_SE_E_REMOLD': {
      const r = textoSemRepetir(textos, 'remold', contexto);
      if (!r) return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
      return respostaTexto('RESPONDER_REMOLD', r.partes, estadoAtual, dadosAtuais, r.chave);
    }
    case 'PERGUNTOU_SE_E_NOVO': {
      const r = textoSemRepetir(textos, 'condicao', contexto);
      if (!r) return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
      return respostaTexto('RESPONDER_CONDICAO', r.partes, estadoAtual, dadosAtuais, r.chave);
    }
    case 'PERGUNTOU_SE_E_CHINES':
      return respostaTexto('RESPONDER_CHINES', textoFluxo(textos, 'chines'), estadoAtual, dadosAtuais, 'chines');
    case 'PERGUNTOU_SE_TEM_JUROS':
      return respostaTexto('RESPONDER_JUROS', textoFluxo(textos, 'juros'), estadoAtual, dadosAtuais, 'juros');
    case 'OFERECEU_BASE_TROCA':
      return respostaTexto('RESPONDER_BASE_TROCA', textoFluxo(textos, 'base_troca'), estadoAtual, dadosAtuais, 'base_troca');
    case 'OFERECEU_VENDER_USADO':
      return respostaTexto('RESPONDER_COMPRA_USADO', textoFluxo(textos, 'compra_usado'), estadoAtual, dadosAtuais, 'compra_usado');
    case 'PERGUNTOU_NOTA_FISCAL':
      return respostaTexto('RESPONDER_NOTA_FISCAL', textoFluxo(textos, 'nota_fiscal'), estadoAtual, dadosAtuais, 'nota_fiscal');
    case 'PERGUNTOU_ALINHAMENTO':
      return respostaTexto('RESPONDER_ALINHAMENTO', textoFluxo(textos, 'alinhamento'), estadoAtual, dadosAtuais, 'alinhamento');
    case 'PEDIU_LOCALIZACAO': {
      const minutos = contexto.minutosDesdeLocalizacao;
      if (typeof minutos === 'number' && minutos < JANELA_PINO_REPETIDO_MIN) {
        return respostaTexto('RESPONDER_LOCALIZACAO_REPETIDA', textoFluxo(textos, 'localizacao_repetida'), estadoAtual, dadosAtuais, 'localizacao_repetida');
      }
      return respostaTexto('ENVIAR_LOCALIZACAO_FIXA', [...textoFluxo(textos, 'localizacao'), MARCADOR_PINO], estadoAtual, dadosAtuais, 'localizacao');
    }
    case 'PERGUNTOU_POR_OUTRA_MARCA':
      return respostaTexto('RESPONDER_OUTRA_MARCA', textoFluxo(textos, 'outra_marca'), estadoAtual, dadosAtuais, 'outra_marca');
    case 'PERGUNTOU_HORARIO':
      return respostaTexto('RESPONDER_HORARIO', textoFluxo(textos, 'horario'), estadoAtual, dadosAtuais, 'horario');
    case 'PEDIU_FOTO':
      return respostaTexto('RESPONDER_FOTO', textoFluxo(textos, 'foto'), estadoAtual, dadosAtuais, 'foto');
    case 'OBJETOU_PRECO_OU_MARCA': {
      const r = textoSemRepetir(textos, 'objecao', contexto);
      if (!r) return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
      return respostaTexto('RESPONDER_OBJECAO', r.partes, estadoAtual, dadosAtuais, r.chave);
    }
    // Vendedor/fornecedor oferecendo pra loja (23/09, pedido do dono): o robo fica CALADO — a mensagem
    // aparece no painel pra equipe decidir. Antes caia na IA livre, que pedia a medida pro fornecedor.
    case 'OFERTA_DE_FORNECEDOR':
      return respostaTexto('SILENCIO', [], estadoAtual, dadosAtuais, 'fornecedor');
    // "É nacional?" (23/09, resposta confirmada pelo dono: feito no Brasil). Antes a IA livre inventava.
    case 'PERGUNTOU_SE_E_NACIONAL':
      return respostaTexto('RESPONDER_NACIONAL', textoFluxo(textos, 'nacional'), estadoAtual, dadosAtuais, 'nacional');
    // Garantia (15/10, audio do dono: 2 anos e 60 mil km). Antes caia como pergunta tecnica na IA livre.
    case 'PERGUNTOU_GARANTIA':
      return respostaTexto('RESPONDER_GARANTIA', textoFluxo(textos, 'garantia'), estadoAtual, dadosAtuais, 'garantia');

    // 21/10: promocao compre 3 e leve 4 — texto do dono (quais medidas valem).
    case 'PERGUNTOU_PROMOCAO_LEVE4':
      return respostaTexto('RESPONDER_PROMOCAO_LEVE4', textoFluxo(textos, 'promocao_leve4'), estadoAtual, dadosAtuais, 'promocao_leve4');

    // 21/10: servico de mecanica (freio, suspensao, oleo...). Loja so de pneu diz que nao faz; oficina (City) chama a equipe.
    case 'PERGUNTOU_SERVICO_OFICINA':
      return respostaTexto('RESPONDER_SERVICO_OFICINA', textoFluxo(textos, 'servico_oficina'), estadoAtual, dadosAtuais, 'servico_oficina');

    // 21/10: cliente diz que vem na loja. Com dia: confirma ({DIA} o bot-service preenche) e o whatsapp-crm agenda os lembretes.
    case 'VAI_VIR_NA_LOJA':
      return intencao.diaVisita
        ? respostaTexto('CONFIRMAR_VISITA', textoFluxo(textos, 'visita_confirmada'), estadoAtual, dadosAtuais, 'visita_confirmada')
        : respostaTexto('CONFIRMAR_VISITA', textoFluxo(textos, 'visita_sem_dia'), estadoAtual, dadosAtuais, 'visita_sem_dia');
    // Só cumprimento / legenda do anúncio (23/09). Antes a IA livre respondia "Oi, tudo bem? + medida".
    // Primeiro contato: cumprimenta e pede a medida. Já pediu a medida e o cliente só respondeu o
    // cumprimento ("tudo bem, graças a Deus"): pede a medida de outro jeito, sem cumprimentar de novo.
    // Com a conversa andando: "Oi, tudo bem? Em que posso te ajudar?" uma vez; se repetir, silêncio.
    case 'SO_SAUDACAO': {
      const retorno = () => ((contexto.jaRespondidas || []).includes('saudacao_retorno')
        ? respostaTexto('SILENCIO', [], estadoAtual, dadosAtuais, 'saudacao_retorno')
        : respostaTexto('RESPONDER_SAUDACAO', textoFluxo(textos, 'saudacao_retorno'), estadoAtual, dadosAtuais, 'saudacao_retorno'));
      if (estadoAtual !== 'sem_estado' && estadoAtual !== 'aguardando_medida') return retorno();
      const pm = pedirMedida(estadoAtual, dadosAtuais, textos, contexto);
      if (pm.acao.tipo !== 'PEDIR_MEDIDA') return retorno();
      // Ja pediu a medida ha pouco (pelo fluxo ou pela IA, mesmo com a conversa ainda "sem estado"): nao cumprimenta
      // de novo. Se o cliente esta voltando depois de horas, cumprimenta e pede de outro jeito.
      const pediuHaPouco = estadoAtual === 'aguardando_medida' || (contexto.jaRespondidas || []).includes('pedir_medida');
      if (pediuHaPouco && contexto.lojaFalouHaPouco !== false) return pm;
      return { ...pm, acao: { tipo: 'PEDIR_MEDIDA', partes: [...textoFluxo(textos, 'saudacao'), ...pm.acao.partes] }, chaves: ['saudacao', ...(pm.chaves || [])] };
    }
    case 'AGRADECEU_OU_ENCERROU': {
      // Responde UMA vez; se o cliente repete o gesto ("ok" e depois "obrigado"), o robo fica em silencio —
      // nem repete nem cai na IA livre (que puxava horario/pergunta de fechamento por conta propria).
      if ((contexto.jaRespondidas || []).includes('agradecimento')) return respostaTexto('SILENCIO', [], estadoAtual, dadosAtuais, 'agradecimento');
      return respostaTexto('RESPONDER_AGRADECIMENTO', textoFluxo(textos, 'agradecimento'), estadoAtual, dadosAtuais, 'agradecimento');
    }
    case 'PERGUNTOU_PARCELAMENTO_GENERICO':
      return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_generico'), estadoAtual, dadosAtuais, 'parcelamento_generico');
    case 'PERGUNTOU_BALANCEAMENTO': {
      const valorRoda = brl(VALOR_BALANCEAMENTO_POR_RODA);
      const comQtd = !!quantidadeConhecida && quantidadeConhecida > 1;
      const partes = comQtd
        ? preencherPlaceholders(textoFluxo(textos, 'balanceamento_quantidade'), { VALOR_RODA: valorRoda, QTD: quantidadeConhecida as number, TOTAL: brl(VALOR_BALANCEAMENTO_POR_RODA * (quantidadeConhecida as number)) })
        : preencherPlaceholders(textoFluxo(textos, 'balanceamento'), { VALOR_RODA: valorRoda });
      return respostaTexto('RESPONDER_BALANCEAMENTO', partes, estadoAtual, dadosAtuais, comQtd ? 'balanceamento_quantidade' : 'balanceamento');
    }
    case 'PERGUNTOU_PARCELAMENTO_ESPECIFICO': {
      const parcelas = intencao.parcelasExtraida;
      // Sem numero de parcelas entendido, ou pedindo mais que o maximo da tabela (10x):
      // nunca inventa valor — responde o que a loja realmente oferece.
      if (!parcelas || parcelas < 1) return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_generico'), estadoAtual, dadosAtuais, 'parcelamento_generico');
      if (parcelas > PARCELAS_MAXIMAS) return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_maximo'), estadoAtual, dadosAtuais, 'parcelamento_maximo');
      const pedido: PedidoEspecifico = { tipo: 'parcelamento_especifico', parcelas };
      const medida = intencao.medidaExtraida || dadosAtuais.medida;
      if (!medida) return pedirMedida(estadoAtual, dadosAtuais, textos, contexto, pedido);
      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido);
    }
    case 'PERGUNTOU_DESCONTO_AVISTA': {
      if (intencao.formaPagamentoExtraida === 'pix') return respostaTexto('RESPONDER_DESCONTO', textoFluxo(textos, 'desconto_pix'), estadoAtual, dadosAtuais, 'desconto_pix');
      const pedido: PedidoEspecifico = { tipo: 'desconto_avista' };
      const medida = intencao.medidaExtraida || dadosAtuais.medida;
      if (!medida) return pedirMedida(estadoAtual, dadosAtuais, textos, contexto, pedido);
      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido);
    }
    default:
      break;
  }

  if (intencao.intencao === 'PERGUNTA_TECNICA' || intencao.intencao === 'OUTRO_ASSUNTO') {
    return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
  }

  if (intencao.intencao === 'DAR_MEDIDA' && intencao.medidaExtraida) {
    // Se o cliente tinha perguntado parcelamento/desconto ANTES de dar a medida, responde ISSO.
    const pendente = pedidoPendente(dadosAtuais);
    return montarAcaoParaMedida(intencao.medidaExtraida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, intencao.medidaExtraida), pendente, !!pendente);
  }

  if (intencao.intencao === 'PERGUNTAR_PRECO_SEM_MEDIDA') {
    if (estadoAtual === 'preco_confirmado' && dadosAtuais.medida) {
      const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
      if (itens.length > 0) {
        return {
          acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, quantidadeConhecida) },
          novoEstado: estadoAtual,
          novosDados: dadosComQuantidade(dadosAtuais, intencao.quantidadeExtraida),
          chaves: ['preco_medida'],
        };
      }
    }
    // Fix pos-review ebbffe36 (gap de estado): cliente ja estava em
    // medida_sem_match — a gente ja ofereceu alternativas REAIS do mesmo aro uma
    // vez (dadosAtuais.aroSemMatch) — e manda outra pergunta de preco sem medida
    // nova. Sem este bloco o codigo caia direto no reset generico abaixo,
    // descartava o aroSemMatch e voltava a pedir a medida do zero, como se
    // nenhuma alternativa tivesse sido oferecida — recorrencia leve do bug do
    // Paulo David (cliente tem que se repetir / bot perde o fio). Re-oferece as
    // MESMAS alternativas em vez de resetar o estado.
    if (estadoAtual === 'medida_sem_match' && dadosAtuais.aroSemMatch) {
      // Truque seguro: nenhum pneu real tem largura/perfil "0", entao
      // "0/0/<aro>" nunca bate um item de verdade na tabela — alternativasMesmoAro
      // so usa o 3o pedaco (o aro) pra filtrar, entao isso reaproveita a funcao
      // pra listar de novo as alternativas reais desse aro sem duplicar logica.
      const alternativas = alternativasMesmoAro(`0/0/${dadosAtuais.aroSemMatch}`);
      if (alternativas) {
        return {
          acao: {
            tipo: 'OFERECER_ALTERNATIVAS',
            partes: [`No aro ${dadosAtuais.aroSemMatch} eu tenho: ${alternativas}. Alguma dessas serve pra você?`],
          },
          novoEstado: estadoAtual,
          novosDados: dadosAtuais,
          chaves: ['medida_inexistente'],
        };
      }
      // Nao deveria acontecer (o aro so vira aroSemMatch se ja tinha alternativa
      // na primeira vez), mas se a tabela mudou nesse meio-tempo e nao ha mais
      // nada nesse aro, cai no reset generico abaixo em vez de travar.
    }
    return pedirMedida(estadoAtual, dadosAtuais, textos, contexto);
  }

  if (intencao.intencao === 'RESPONDER_QUANTIDADE' && estadoAtual === 'preco_confirmado' && dadosAtuais.medida) {
    const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
    if (itens.length > 0) {
      return {
        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, intencao.quantidadeExtraida) },
        novoEstado: 'preco_confirmado',
        novosDados: dadosComQuantidade(dadosAtuais, intencao.quantidadeExtraida),
        chaves: ['preco_medida'],
      };
    }
  }

  if (intencao.intencao === 'ESCOLHER_ALTERNATIVA' && estadoAtual === 'medida_sem_match' && intencao.escolhaAlternativa) {
    const pendente = pedidoPendente(dadosAtuais);
    return montarAcaoParaMedida(intencao.escolhaAlternativa, textos, quantidadeConhecida, pendente, !!pendente);
  }

  // Intencao nao reconhecida dado o estado atual (ex.: RESPONDER_QUANTIDADE sem
  // medida salva) — sai do fluxo em vez de arriscar uma acao errada.
  return SAI_DO_FLUXO(estadoAtual, dadosAtuais);
}
