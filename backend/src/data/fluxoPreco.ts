import { ItemPreco, encontrarPrecosExatosPorMedida, alternativasMesmoAro, montarPartesPreco } from './tabelaPrecos';

// FLUXO DETERMINISTICO DE MEDIDA/PRECO (10/09).
//
// Substitui a decisao livre da IA por: codigo consulta a tabela de precos de
// verdade e decide a acao. A IA (fluxoPrecoExtrator.ts) so entra pra ENTENDER a
// mensagem do cliente (formulario fixo, nunca texto livre) — nunca pra decidir
// o que responder nem pra gerar numero. Ver design em
// docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md.

export type EstadoPrecoFluxo = 'sem_estado' | 'aguardando_medida' | 'medida_sem_match' | 'preco_confirmado';

export interface DadosPrecoFluxo {
  medida?: string;
  aroSemMatch?: string;
}

export type IntencaoTipo =
  | 'DAR_MEDIDA'
  | 'PERGUNTAR_PRECO_SEM_MEDIDA'
  | 'RESPONDER_QUANTIDADE'
  | 'ESCOLHER_ALTERNATIVA'
  | 'PERGUNTA_TECNICA'
  | 'OUTRO_ASSUNTO';

export interface IntencaoExtraida {
  intencao: IntencaoTipo;
  medidaExtraida: string | null;
  quantidadeExtraida: number | null;
  escolhaAlternativa: string | null;
}

export type AcaoPreco =
  | { tipo: 'PEDIR_MEDIDA'; partes: string[] }
  | { tipo: 'CONFIRMAR_PRECO'; partes: string[] }
  | { tipo: 'OFERECER_ALTERNATIVAS'; partes: string[] }
  | { tipo: 'NADA' }; // sai do fluxo — cai no caminho de IA livre de hoje

export interface ResultadoDecisao {
  acao: AcaoPreco;
  novoEstado: EstadoPrecoFluxo;
  novosDados: DadosPrecoFluxo;
}

const PEDIR_MEDIDA_TEXTO = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const SEM_ALTERNATIVA_FALLBACK = 'Pra eu te passar o valor certinho sem risco de errar, me confirma a medida exata que esta escrita no flanco do pneu (ex.: 175/65/14)?';

function montarAcaoParaMedida(medida: string): { acao: AcaoPreco; novoEstado: EstadoPrecoFluxo; novosDados: DadosPrecoFluxo } {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (itens.length > 0) {
    // Achado 09/09 (SEJA DECISIVO): quando ha mais de um modelo pra mesma medida,
    // pega o primeiro em vez de perguntar — a loja ja escolhe por preco/uso.
    const item = itens[0]!;
    const partes = montarPartesPreco(item, null, null);
    return {
      acao: { tipo: 'CONFIRMAR_PRECO', partes },
      novoEstado: 'preco_confirmado',
      novosDados: { medida: item.medida },
    };
  }
  const aro = medida.split('/')[2] || '';
  const alternativas = alternativasMesmoAro(medida);
  const texto = alternativas
    ? `Essa medida a gente não tem, infelizmente. No mesmo aro eu tenho: ${alternativas}. Alguma dessas serve pra você?`
    : SEM_ALTERNATIVA_FALLBACK;
  return {
    acao: { tipo: 'OFERECER_ALTERNATIVAS', partes: [texto] },
    novoEstado: alternativas ? 'medida_sem_match' : 'sem_estado',
    novosDados: alternativas ? { aroSemMatch: aro } : {},
  };
}

/**
 * Motor de decisao PURO — sem I/O, sem IA, 100% testavel sem rede.
 * Recebe a intencao ja extraida (pela IA, em fluxoPrecoExtrator.ts) + o estado
 * salvo da conversa, e devolve a ACAO pronta (com os numeros ja resolvidos pela
 * tabela) + o proximo estado.
 */
export function decidirAcaoPreco(
  intencao: IntencaoExtraida,
  estadoAtual: EstadoPrecoFluxo,
  dadosAtuais: DadosPrecoFluxo
): ResultadoDecisao {
  if (intencao.intencao === 'PERGUNTA_TECNICA' || intencao.intencao === 'OUTRO_ASSUNTO') {
    return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
  }

  if (intencao.intencao === 'DAR_MEDIDA' && intencao.medidaExtraida) {
    return montarAcaoParaMedida(intencao.medidaExtraida);
  }

  if (intencao.intencao === 'PERGUNTAR_PRECO_SEM_MEDIDA') {
    if (estadoAtual === 'preco_confirmado' && dadosAtuais.medida) {
      const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
      if (itens.length > 0) {
        return {
          acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, intencao.quantidadeExtraida) },
          novoEstado: estadoAtual,
          novosDados: dadosAtuais,
        };
      }
    }
    return {
      acao: { tipo: 'PEDIR_MEDIDA', partes: [PEDIR_MEDIDA_TEXTO] },
      novoEstado: 'aguardando_medida',
      novosDados: dadosAtuais,
    };
  }

  if (intencao.intencao === 'RESPONDER_QUANTIDADE' && dadosAtuais.medida) {
    const itens = encontrarPrecosExatosPorMedida(dadosAtuais.medida);
    if (itens.length > 0) {
      return {
        acao: { tipo: 'CONFIRMAR_PRECO', partes: montarPartesPreco(itens[0]!, null, intencao.quantidadeExtraida) },
        novoEstado: 'preco_confirmado',
        novosDados: dadosAtuais,
      };
    }
  }

  if (intencao.intencao === 'ESCOLHER_ALTERNATIVA' && estadoAtual === 'medida_sem_match' && intencao.escolhaAlternativa) {
    return montarAcaoParaMedida(intencao.escolhaAlternativa);
  }

  // Intencao nao reconhecida dado o estado atual (ex.: RESPONDER_QUANTIDADE sem
  // medida salva) — sai do fluxo em vez de arriscar uma acao errada.
  return { acao: { tipo: 'NADA' }, novoEstado: estadoAtual, novosDados: dadosAtuais };
}
