// TRAVA POS-ORCAMENTO (23/10, caso real Marcelo Santos 556199788540): o robo cotou 175/65/14 e ja tinha dito
// "Se preferir, voce pode parcelar em ate 10x no cartao!". O cliente mandou so "2010" e a IA livre repetiu o
// parcelamento (colado em "Quando voce consegue passar aqui na loja?", entao a trava de repeticao, que compara a
// bolha inteira, nao pegou) e ainda se justificou: "O 175/65/14 que te passei antes e mais dos Gol mais novos."
// Aqui o CODIGO corta, frase por frase, das partes da IA livre:
//  (a) o parcelamento "ate 10x", se a loja ja disse isso nas ultimas ~10 mensagens dela;
//  (b) frase que justifica/explica um orcamento anterior ("que te passei antes", "que eu te mandei antes").
// Nunca deixa a resposta vazia por causa disso: se nao sobrar nada, volta a 1a bolha original.
// Puro: sem I/O, sem IA.

export const JANELA_MSGS_LOJA_PARCELAMENTO = 10;

const RE_PARCELAMENTO = /parcel\w*\s+(?:\S+\s+){0,3}?em\s+at[eé]\s+10\s*x|at[eé]\s+10\s*x\s+no\s+cart[aã]o/i;
const RE_JUSTIFICA_ANTERIOR = /\b(?:que|qual|o\s+qual)\s+(?:eu\s+)?(?:j[aá]\s+)?(?:te|lhe|t)\s+(?:passei|mandei|falei|informei|enviei|cotei|ofereci|indiquei)\b(?:\s+\S+){0,3}?\s+(?:antes|anteriormente|agora\s+h[aá]\s+pouco|h[aá]\s+pouco|mais\s+cedo)\b|\b(?:te|lhe)\s+(?:passei|mandei|falei|cotei)\s+antes\b/i;

function frasesDaBolha(bolha: string): string[] {
  return String(bolha || '').split(/(?<=[.!?…])\s+/u).map((f) => f.trim()).filter(Boolean);
}

export function lojaJaFalouParcelamento(mensagensDaLoja: string[]): boolean {
  return mensagensDaLoja.slice(-JANELA_MSGS_LOJA_PARCELAMENTO).some((t) => RE_PARCELAMENTO.test(String(t || '')));
}

export function ehJustificativaDeOrcamentoAnterior(frase: string): boolean {
  return RE_JUSTIFICA_ANTERIOR.test(String(frase || ''));
}

/**
 * `partes` = bolhas da IA livre; `anteriores` = conversa antes da rajada ({role, content}).
 * Devolve as bolhas sem as frases cortadas (bolha que fica vazia some). Nunca devolve vazio se `partes` nao era vazio.
 */
export function removerParcelamentoRepetidoEJustificativa(partes: string[], anteriores: Array<{ role?: string; content?: unknown }>): { partes: string[]; cortadas: string[] } {
  const daLoja = (Array.isArray(anteriores) ? anteriores : []).filter((m) => m?.role === 'assistant').map((m) => String(m?.content ?? ''));
  const cortarParcelamento = lojaJaFalouParcelamento(daLoja);
  const cortadas: string[] = [];
  const saida: string[] = [];
  for (const bolha of partes || []) {
    const frases = frasesDaBolha(bolha);
    const ficam = frases.filter((f) => {
      const corta = (cortarParcelamento && RE_PARCELAMENTO.test(f)) || ehJustificativaDeOrcamentoAnterior(f);
      if (corta) cortadas.push(f);
      return !corta;
    });
    if (ficam.length === frases.length) { saida.push(bolha); continue; }
    if (ficam.length) saida.push(ficam.join(' '));
  }
  if (!saida.length && (partes || []).length) return { partes: [partes[0] as string], cortadas };
  return { partes: saida, cortadas };
}
