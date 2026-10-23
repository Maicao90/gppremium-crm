// TRAVA POS-ORCAMENTO (23/10, caso real Marcelo Santos 556199788540): o robo cotou 175/65/14 e ja tinha dito
// "Se preferir, voce pode parcelar em ate 10x no cartao!". O cliente mandou so "2010" e a IA livre repetiu o
// parcelamento (colado em "Quando voce consegue passar aqui na loja?", entao a trava de repeticao, que compara a
// bolha inteira, nao pegou) e ainda se justificou: "O 175/65/14 que te passei antes e mais dos Gol mais novos."
// Aqui o CODIGO corta, frase por frase, das partes da IA livre:
//  (a) o parcelamento "ate 10x", se a loja ja disse isso nas ultimas ~10 mensagens dela;
//  (b) frase que justifica/explica um orcamento anterior ("que te passei antes", "que eu te mandei antes").
// Nunca deixa a resposta vazia por causa disso: se nao sobrar nada, volta a 1a bolha original.
// Puro: sem I/O, sem IA.

import { extrairMedidasDoTexto } from './tabelaPrecos';

export const JANELA_MSGS_LOJA_PARCELAMENTO = 10;
// (b2) Frase sobre uma medida que a loja JA COTOU antes, que nao e a medida que a resposta nova cota e que o cliente
// nao citou agora, com cara de explicacao ("Se o seu for da 175/65/14, o valor continua R$ 249,00").
// (fronteira de palavra com \p{L}: o \b do JS nao enxerga o "é")
const RE_TOM_DE_JUSTIFICATIVA = /(?<![\p{L}\d])(?:continua|segue|valendo|antes|passei|mandei|falei|cotei|se\s+o\s+seu\s+for|mais\s+d[oa]s|[eé]\s+(?:d[eoa]s?|pra|para)|era\s+d[ao]|outra\s+medida)(?![\p{L}\d])/iu;

const RE_PARCELAMENTO = /parcel\w*\s+(?:\S+\s+){0,3}?em\s+at[eé]\s+10\s*x|at[eé]\s+10\s*x\s+no\s+cart[aã]o/i;
const RE_PRECO = /R\$\s*\d/;
// So o pedaco do parcelamento dentro de uma frase com preco (", e da pra parcelar em ate 10x no cartao").
const RE_TRECHO_PARCELAMENTO = /,?\s*(?:e\s+)?(?:tamb[eé]m\s+)?(?:(?:d[aá]|d[eê])\s+(?:pra|para)\s+|(?:voc[eê]\s+)?(?:pode|consegue)\s+|d[aá]\s+)?(?:parcel\w*\s+(?:\S+\s+){0,3}?em\s+at[eé]\s+10\s*x(?:\s+no\s+cart[aã]o)?|em\s+at[eé]\s+10\s*x\s+no\s+cart[aã]o)/i;
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

// "Corrigindo o que te passei antes: nessa medida sai por R$ 279,00." -> "Nessa medida sai por R$ 279,00."
// "Sai por R$ 279,00, entao vale esse valor no lugar do que te passei antes." -> "Sai por R$ 279,00."
function tirarTrechoDeJustificativa(frase: string): string | null {
  const m = RE_JUSTIFICA_ANTERIOR.exec(frase);
  if (!m) return null;
  const doisPontos = frase.indexOf(':', m.index);
  if (doisPontos >= 0) {
    const resto = frase.slice(doisPontos + 1).trim();
    return resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : null;
  }
  // ", " (virgula + espaco): a virgula de "279,00" nunca e ponto de corte.
  const virgula = frase.lastIndexOf(', ', m.index);
  if (virgula <= 0) return null;
  const antes = frase.slice(0, virgula).trim();
  return antes ? `${antes}.` : null;
}

/**
 * `partes` = bolhas da IA livre; `anteriores` = conversa antes da rajada ({role, content}).
 * Devolve as bolhas sem as frases cortadas (bolha que fica vazia some). Nunca devolve vazio se `partes` nao era vazio.
 */
export function removerParcelamentoRepetidoEJustificativa(partes: string[], anteriores: Array<{ role?: string; content?: unknown }>, rajada: string[] = []): { partes: string[]; cortadas: string[] } {
  const daLoja = (Array.isArray(anteriores) ? anteriores : []).filter((m) => m?.role === 'assistant').map((m) => String(m?.content ?? ''));
  const cortarParcelamento = lojaJaFalouParcelamento(daLoja);
  // Medidas que a loja ja cotou (mensagem dela com R$) nas ultimas mensagens; a principal da resposta nova = a 1a que ela cita.
  const jaCotadas = new Set(daLoja.slice(-JANELA_MSGS_LOJA_PARCELAMENTO).filter((t) => /R\$\s*\d/.test(t)).flatMap((t) => extrairMedidasDoTexto(t)));
  const principal = extrairMedidasDoTexto((partes || []).join('\n'))[0] || null;
  const citadasPeloCliente = new Set(extrairMedidasDoTexto(rajada.join('\n')));
  const falaDeOrcamentoAnterior = (f: string) => !!principal && RE_TOM_DE_JUSTIFICATIVA.test(f)
    && extrairMedidasDoTexto(f).some((m) => m !== principal && jaCotadas.has(m) && !citadasPeloCliente.has(m));
  // Frase com preco so sai inteira se o preco e de OUTRA medida (a do orcamento anterior). O preco/medida novos nunca somem.
  const precoDeOutraMedida = (f: string) => extrairMedidasDoTexto(f).some((m) => m !== principal);
  const cortadas: string[] = [];
  const saida: string[] = [];
  for (const bolha of partes || []) {
    const frases = frasesDaBolha(bolha);
    let mexeu = false;
    const ficam: string[] = [];
    for (const f of frases) {
      const temPreco = RE_PRECO.test(f);
      if (ehJustificativaDeOrcamentoAnterior(f) || falaDeOrcamentoAnterior(f)) {
        if (!temPreco || precoDeOutraMedida(f)) { cortadas.push(f); mexeu = true; continue; }
        // Frase com o preco NOVO + justificativa ("...R$ 279,00, entao vale esse valor no lugar do que te passei antes."):
        // tira so o pedaco da justificativa; se o preco nao sobreviver, a frase fica inteira.
        const semJustificativa = tirarTrechoDeJustificativa(f);
        if (semJustificativa && semJustificativa !== f && RE_PRECO.test(semJustificativa)) {
          cortadas.push(`(so a justificativa) ${f}`); ficam.push(semJustificativa); mexeu = true; continue;
        }
      }
      if (cortarParcelamento && RE_PARCELAMENTO.test(f)) {
        if (!temPreco) { cortadas.push(f); mexeu = true; continue; }
        // "Ela sai por R$ 279,00 a vista e da pra parcelar em ate 10x no cartao." -> tira so o pedaco do parcelamento.
        const semParcelamento = f.replace(RE_TRECHO_PARCELAMENTO, '').replace(/\s+([.!?…])/g, '$1').replace(/[,\s]+$/, '').trim();
        if (semParcelamento && RE_PRECO.test(semParcelamento) && !RE_PARCELAMENTO.test(semParcelamento)) {
          const final = /[.!?…]$/.test(semParcelamento) ? semParcelamento : `${semParcelamento}.`;
          cortadas.push(`(so o parcelamento) ${f}`);
          ficam.push(final); mexeu = true; continue;
        }
      }
      ficam.push(f);
    }
    if (!mexeu) { saida.push(bolha); continue; }
    if (ficam.length) saida.push(ficam.join(' '));
  }
  if (!saida.length && (partes || []).length) return { partes: [partes[0] as string], cortadas };
  // Trava final: a medida principal da resposta nova tem que continuar na resposta; senao, nao corta nada.
  if (principal && !extrairMedidasDoTexto(saida.join('\n')).includes(principal)) return { partes: [...partes], cortadas: [] };
  return { partes: saida, cortadas };
}
