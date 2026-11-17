import { extrairMedidasDoTexto, encontrarPrecosExatosPorMedida } from './tabelaPrecos';

// RETOMADA DEPOIS DO "SO UM INSTANTE" (23/10). Cliente pediu pneu que NAO esta na tabela: o robo manda "so um instante",
// etiqueta e pausa a conversa (motivoPausa 'fora_da_lista', 12 h) pra atendente assumir. Caso real: o cliente manda logo
// depois OUTRA medida (que a loja tem), ou "voces tem?", ou "???", e ficava sem resposta ate alguem ver.
// Regra: a pausa e SO 'fora_da_lista' + nenhuma pessoa da loja escreveu desde a pausa + o cliente mandou, depois da pausa,
// uma medida que EXISTE na tabela -> o robo volta (tira a pausa e segue o fluxo normal, com o preco).
// Qualquer outra pausa (painel, ∞, eco de atendente, anti-loop, curriculo...) nao e tocada. Puro: sem banco, sem IA.

export interface MensagemDesdeAPausa {
  fromMe: boolean;
  enviadoPorId?: string | null;
  texto?: string | null;
  tipo?: string | null;
  timestamp: Date | string;
}

export interface DecisaoRetomada {
  liberar: boolean;
  motivo: 'nao_pausada' | 'outro_motivo' | 'pausa_longa' | 'atendente_escreveu' | 'sem_medida_da_tabela' | 'medida_da_tabela';
  medida?: string;
}

export const MOTIVO_FORA_DA_LISTA = 'fora_da_lista';
// Pausa automatica de fora da lista e de horas; algo alem disso nao e ela (∞ do painel, etc.): nao mexe.
const PAUSA_MAXIMA_FORA_DA_LISTA_MS = 3 * 24 * 3600_000;
// Mensagens que a loja manda sem ser uma pessoa (mesma regra do "atendente assumiu" em botAtendimentoService.ts).
const MSG_AUTOMATICA_DA_LOJA = /Seja bem-vindo\(a\)|^\s*🙋🏼‍♀️\s*$/;

export function ehPessoaDaLoja(m: MensagemDesdeAPausa): boolean {
  return !!m.fromMe && m.enviadoPorId !== 'bot' && m.enviadoPorId !== 'meta_ai' && !MSG_AUTOMATICA_DA_LOJA.test(String(m.texto || ''));
}

// Inicio da pausa 'fora_da_lista': ela e gravada como agora + PAUSA_FORA_DA_LISTA_MIN (ver pausaSemEncurtar).
export function inicioDaPausaForaDaLista(pausadoAte: Date, pausaMin: number): Date {
  return new Date(pausadoAte.getTime() - pausaMin * 60_000);
}

/**
 * `mensagensDesdeAPausa` = mensagens da conversa (cliente e loja) com timestamp >= inicio da pausa.
 */
export function decidirRetomadaForaDaLista(p: {
  pausadoAte: Date | null | undefined;
  motivoPausa: string | null | undefined;
  agora: Date;
  mensagensDesdeAPausa: MensagemDesdeAPausa[];
}): DecisaoRetomada {
  if (!p.pausadoAte || p.pausadoAte.getTime() <= p.agora.getTime()) return { liberar: false, motivo: 'nao_pausada' };
  if (p.motivoPausa !== MOTIVO_FORA_DA_LISTA) return { liberar: false, motivo: 'outro_motivo' };
  if (p.pausadoAte.getTime() - p.agora.getTime() > PAUSA_MAXIMA_FORA_DA_LISTA_MS) return { liberar: false, motivo: 'pausa_longa' };
  if (p.mensagensDesdeAPausa.some(ehPessoaDaLoja)) return { liberar: false, motivo: 'atendente_escreveu' };
  for (const m of p.mensagensDesdeAPausa) {
    if (m.fromMe) continue;
    const medida = extrairMedidasDoTexto(String(m.texto || '')).find((x) => encontrarPrecosExatosPorMedida(x).length > 0);
    if (medida) return { liberar: true, motivo: 'medida_da_tabela', medida };
  }
  return { liberar: false, motivo: 'sem_medida_da_tabela' };
}
