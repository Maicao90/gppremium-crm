import { ItemPreco, encontrarPrecosExatosPorMedida, alternativasMesmoAro, montarPartesPreco, montarPartesDescontoAVista, brl } from './tabelaPrecos';
import { TextosFluxo, textoFluxo, preencherPlaceholders, VARIANTE_REPETICAO } from './fluxoCatalogo';

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
  | 'OUTRO_ASSUNTO';

export interface IntencaoExtraida {
  intencao: IntencaoTipo;
  medidaExtraida: string | null;
  quantidadeExtraida: number | null;
  escolhaAlternativa: string | null;
  parcelasExtraida?: number | null;
  formaPagamentoExtraida?: 'dinheiro' | 'pix' | null;
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
  | 'RESPONDER_HORARIO'
  | 'RESPONDER_FOTO'
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
}

// Fatos da conversa que quem tem banco (botAtendimentoService) sabe e este motor puro nao.
export interface ContextoFluxo {
  // Ha quantos minutos o pino de localizacao foi mandado nesta conversa (robo ou atendente),
  // olhando ate 12h atras; null/ausente = ainda nao foi mandado.
  minutosDesdeLocalizacao?: number | null;
  // Chaves de resposta (e variantes) cujo texto o robo JA mandou ha pouco nesta conversa
  // (ver chavesJaRespondidas em fluxoCatalogo.ts). Evita repetir a mesma explicacao palavra por palavra.
  jaRespondidas?: string[];
}

// Texto da resposta, trocando pela variante quando o robo ja disse o mesmo ha pouco. null = ja disse a
// versao normal E a variante: nao repete de novo, sai do fluxo (a IA livre, com as travas, segue a conversa).
function textoSemRepetir(textos: TextosFluxo, chave: string, contexto: ContextoFluxo): string[] | null {
  const variante = VARIANTE_REPETICAO[chave];
  const ja = contexto.jaRespondidas || [];
  if (variante && ja.includes(chave)) return ja.includes(variante) ? null : textoFluxo(textos, variante);
  return textoFluxo(textos, chave);
}

// Pediu o endereco de novo dentro dessa janela: responde so em texto, nao manda o pino outra vez
// (achado 18/09, caso Marcia Lima: 3 pinos em 5 minutos).
const JANELA_PINO_REPETIDO_MIN = 30;

// Marcador que o motor coloca DENTRO das partes, na posicao exata em que o pino da loja tem que
// sair (depois do texto "Segue a nossa localizacao"). Quem envia (botAtendimentoService) troca
// pelo envio real do pino. Fica em `partes` pra manter a ORDEM certa numa resposta com varios assuntos.
export const MARCADOR_PINO = '[ENVIAR_LOCALIZACAO]';

const VALOR_BALANCEAMENTO_POR_RODA = 25;
const PARCELAS_MAXIMAS = 10;

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

function respostaTexto(tipo: TipoAcaoTexto, partes: string[], estadoAtual: EstadoPrecoFluxo, dadosAtuais: DadosPrecoFluxo): ResultadoDecisao {
  return { acao: { tipo, partes }, novoEstado: estadoAtual, novosDados: dadosAtuais };
}

function pedirMedida(dadosAtuais: DadosPrecoFluxo, textos: TextosFluxo, pedido?: PedidoEspecifico): ResultadoDecisao {
  // Reset de medida/aroSemMatch (estado promete recomeco limpo), mas guarda o pedido
  // especifico e a quantidade — sao coisas que o cliente ja disse e nao devem se perder.
  const dados: DadosPrecoFluxo = {};
  if (dadosAtuais.quantidade) dados.quantidade = dadosAtuais.quantidade;
  const tipoPedido = pedido?.tipo ?? dadosAtuais.intencaoPendente;
  if (tipoPedido) dados.intencaoPendente = tipoPedido;
  const parcelas = pedido?.tipo === 'parcelamento_especifico' ? pedido.parcelas : dadosAtuais.parcelasPendentes;
  if (tipoPedido === 'parcelamento_especifico' && parcelas) dados.parcelasPendentes = parcelas;
  return { acao: { tipo: 'PEDIR_MEDIDA', partes: textoFluxo(textos, 'pedir_medida') }, novoEstado: 'aguardando_medida', novosDados: dados };
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
      return { acao: { tipo: 'RESPONDER_PARCELAMENTO_ESPECIFICO', partes }, novoEstado: 'preco_confirmado', novosDados };
    }
    if (pedido?.tipo === 'desconto_avista') {
      return { acao: { tipo: 'RESPONDER_DESCONTO', partes: montarPartesDescontoAVista(item, quantidade) }, novoEstado: 'preco_confirmado', novosDados };
    }
    const partes = montarPartesPreco(item, null, quantidade);
    return { acao: { tipo: 'CONFIRMAR_PRECO', partes }, novoEstado: 'preco_confirmado', novosDados };
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
  return {
    acao: { tipo: 'OFERECER_ALTERNATIVAS', partes: partesSemMatch },
    novoEstado: alternativas ? 'medida_sem_match' : 'sem_estado',
    novosDados: dadosSemMatch,
  };
}

export interface ResultadoSequencia {
  acaoPrincipal: AcaoPreco['tipo']; // tipo da 1a acao que respondeu; 'NADA' = sai do fluxo (cai na IA livre)
  partes: string[];
  novoEstado: EstadoPrecoFluxo;
  novosDados: DadosPrecoFluxo;
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
  const saidaNada: ResultadoSequencia = { acaoPrincipal: 'NADA', partes: [], novoEstado: estadoAtual, novosDados: dadosAtuais };
  const itens = intencoes.slice(0, MAX_ASSUNTOS_POR_RAJADA);
  if (itens.length === 0 || itens.some((i) => i.intencao === 'PERGUNTA_TECNICA')) return saidaNada;

  let estado = estadoAtual;
  let dados = dadosAtuais;
  const partes: string[] = [];
  let acaoPrincipal: AcaoPreco['tipo'] = 'NADA';
  let pinNaRajada = false;

  for (const item of itens) {
    if (item.intencao === 'PEDIU_LOCALIZACAO' && pinNaRajada) continue;
    const r = decidirAcaoPreco(item, estado, dados, textos, contexto);
    if (r.acao.tipo === 'NADA') continue;
    if (acaoPrincipal === 'NADA') acaoPrincipal = r.acao.tipo;
    if (r.acao.partes.includes(MARCADOR_PINO)) pinNaRajada = true;
    for (const p of r.acao.partes) {
      if (p === MARCADOR_PINO || !partes.includes(p)) partes.push(p);
    }
    estado = r.novoEstado;
    dados = r.novosDados;
  }

  if (acaoPrincipal === 'NADA' || partes.length === 0) return saidaNada;
  return { acaoPrincipal, partes: partes.slice(0, MAX_PARTES_POR_RAJADA), novoEstado: estado, novosDados: dados };
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
      const partes = textoSemRepetir(textos, 'remold', contexto);
      if (!partes) return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
      return respostaTexto('RESPONDER_REMOLD', partes, estadoAtual, dadosAtuais);
    }
    case 'PERGUNTOU_SE_E_CHINES':
      return respostaTexto('RESPONDER_CHINES', textoFluxo(textos, 'chines'), estadoAtual, dadosAtuais);
    case 'PERGUNTOU_SE_TEM_JUROS':
      return respostaTexto('RESPONDER_JUROS', textoFluxo(textos, 'juros'), estadoAtual, dadosAtuais);
    case 'OFERECEU_BASE_TROCA':
      return respostaTexto('RESPONDER_BASE_TROCA', textoFluxo(textos, 'base_troca'), estadoAtual, dadosAtuais);
    case 'OFERECEU_VENDER_USADO':
      return respostaTexto('RESPONDER_COMPRA_USADO', textoFluxo(textos, 'compra_usado'), estadoAtual, dadosAtuais);
    case 'PERGUNTOU_NOTA_FISCAL':
      return respostaTexto('RESPONDER_NOTA_FISCAL', textoFluxo(textos, 'nota_fiscal'), estadoAtual, dadosAtuais);
    case 'PERGUNTOU_ALINHAMENTO':
      return respostaTexto('RESPONDER_ALINHAMENTO', textoFluxo(textos, 'alinhamento'), estadoAtual, dadosAtuais);
    case 'PEDIU_LOCALIZACAO': {
      const minutos = contexto.minutosDesdeLocalizacao;
      if (typeof minutos === 'number' && minutos < JANELA_PINO_REPETIDO_MIN) {
        return respostaTexto('RESPONDER_LOCALIZACAO_REPETIDA', textoFluxo(textos, 'localizacao_repetida'), estadoAtual, dadosAtuais);
      }
      return respostaTexto('ENVIAR_LOCALIZACAO_FIXA', [...textoFluxo(textos, 'localizacao'), MARCADOR_PINO], estadoAtual, dadosAtuais);
    }
    case 'PERGUNTOU_POR_OUTRA_MARCA':
      return respostaTexto('RESPONDER_OUTRA_MARCA', textoFluxo(textos, 'outra_marca'), estadoAtual, dadosAtuais);
    case 'PERGUNTOU_HORARIO':
      return respostaTexto('RESPONDER_HORARIO', textoFluxo(textos, 'horario'), estadoAtual, dadosAtuais);
    case 'PEDIU_FOTO':
      return respostaTexto('RESPONDER_FOTO', textoFluxo(textos, 'foto'), estadoAtual, dadosAtuais);
    case 'OBJETOU_PRECO_OU_MARCA': {
      const partes = textoSemRepetir(textos, 'objecao', contexto);
      if (!partes) return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
      return respostaTexto('RESPONDER_OBJECAO', partes, estadoAtual, dadosAtuais);
    }
    case 'PERGUNTOU_PARCELAMENTO_GENERICO':
      return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_generico'), estadoAtual, dadosAtuais);
    case 'PERGUNTOU_BALANCEAMENTO': {
      const valorRoda = brl(VALOR_BALANCEAMENTO_POR_RODA);
      const partes = quantidadeConhecida && quantidadeConhecida > 1
        ? preencherPlaceholders(textoFluxo(textos, 'balanceamento_quantidade'), { VALOR_RODA: valorRoda, QTD: quantidadeConhecida, TOTAL: brl(VALOR_BALANCEAMENTO_POR_RODA * quantidadeConhecida) })
        : preencherPlaceholders(textoFluxo(textos, 'balanceamento'), { VALOR_RODA: valorRoda });
      return respostaTexto('RESPONDER_BALANCEAMENTO', partes, estadoAtual, dadosAtuais);
    }
    case 'PERGUNTOU_PARCELAMENTO_ESPECIFICO': {
      const parcelas = intencao.parcelasExtraida;
      // Sem numero de parcelas entendido, ou pedindo mais que o maximo da tabela (10x):
      // nunca inventa valor — responde o que a loja realmente oferece.
      if (!parcelas || parcelas < 1) return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_generico'), estadoAtual, dadosAtuais);
      if (parcelas > PARCELAS_MAXIMAS) return respostaTexto('RESPONDER_PARCELAMENTO_GENERICO', textoFluxo(textos, 'parcelamento_maximo'), estadoAtual, dadosAtuais);
      const pedido: PedidoEspecifico = { tipo: 'parcelamento_especifico', parcelas };
      const medida = intencao.medidaExtraida || dadosAtuais.medida;
      if (!medida) return pedirMedida(dadosAtuais, textos, pedido);
      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido);
    }
    case 'PERGUNTOU_DESCONTO_AVISTA': {
      if (intencao.formaPagamentoExtraida === 'pix') return respostaTexto('RESPONDER_DESCONTO', textoFluxo(textos, 'desconto_pix'), estadoAtual, dadosAtuais);
      const pedido: PedidoEspecifico = { tipo: 'desconto_avista' };
      const medida = intencao.medidaExtraida || dadosAtuais.medida;
      if (!medida) return pedirMedida(dadosAtuais, textos, pedido);
      return montarAcaoParaMedida(medida, textos, quantidadeAplicavel(intencao, estadoAtual, dadosAtuais, medida), pedido);
    }
    default:
      break;
  }

  if (intencao.intencao === 'PERGUNTA_TECNICA' || intencao.intencao === 'OUTRO_ASSUNTO') {
    return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
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
        };
      }
      // Nao deveria acontecer (o aro so vira aroSemMatch se ja tinha alternativa
      // na primeira vez), mas se a tabela mudou nesse meio-tempo e nao ha mais
      // nada nesse aro, cai no reset generico abaixo em vez de travar.
    }
    return pedirMedida(dadosAtuais, textos);
  }

  if (intencao.intencao === 'RESPONDER_QUANTIDADE' && estadoAtual === 'preco_confirmado' && dadosAtuais.medida) {
    const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
    if (itens.length > 0) {
      return {
        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, intencao.quantidadeExtraida) },
        novoEstado: 'preco_confirmado',
        novosDados: dadosComQuantidade(dadosAtuais, intencao.quantidadeExtraida),
      };
    }
  }

  if (intencao.intencao === 'ESCOLHER_ALTERNATIVA' && estadoAtual === 'medida_sem_match' && intencao.escolhaAlternativa) {
    const pendente = pedidoPendente(dadosAtuais);
    return montarAcaoParaMedida(intencao.escolhaAlternativa, textos, quantidadeConhecida, pendente, !!pendente);
  }

  // Intencao nao reconhecida dado o estado atual (ex.: RESPONDER_QUANTIDADE sem
  // medida salva) — sai do fluxo em vez de arriscar uma acao errada.
  return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
}
