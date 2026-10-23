import { TABELA_PRECOS_GP, extrairMedidasDoTexto, normalizarTextoMedida } from './tabelaPrecos';

// MEDIDA EM PEDACOS (22/10, caso real 556198132318): o cliente manda a medida quebrada em mensagens
// separadas — "195/55" numa, "aro 16" em outra, em qualquer ordem. Cada mensagem sozinha nao tem a medida
// inteira, entao o robo pedia a medida de novo (com o exemplo generico) ou perguntava o carro, quando
// 195/55 + aro 16 ja e 195/55/16. Aqui o CODIGO junta os pedacos das mensagens recentes do cliente.
// Puro: sem I/O, sem IA.

export interface MensagemConversa { role: string; content: unknown }

export interface PartesDaMedida {
  larguraPerfil: string | null; // "195/55"
  aro: string | null;           // "16"
  medida: string | null;        // "195/55/16" (so quando os dois pedacos existem)
  daRajada: boolean;            // algum pedaco usado veio das mensagens ainda sem resposta (o cliente acabou de falar disso)
  larguraPerfilNaRajada: boolean;
}

// Recencia: so olha as ultimas N mensagens da conversa (cliente + loja) e nunca passa de uma resposta da loja
// que ja deu preco (fecha o ciclo daquele orcamento). Se a loja nao fala ha mais de 4h, o cliente esta voltando
// (outro dia/outra conversa): so vale o que ele mandou agora.
export const JANELA_MENSAGENS_MEDIDA = 8;
export const JANELA_MINUTOS_MEDIDA = 240;

const LEGENDA_ANUNCIO = /^\s*📢\s*\[An[uú]ncio\]/i;
const PLACEHOLDER_MIDIA = /^\[[^\]]+\]$/;
const LOJA_DEU_PRECO = /R\$\s*\d/;

// Larguras que existem (terminam em 5: 155..335) e perfis de 25 a 85 de 5 em 5.
const LP = '(1[3-9]5|2\\d5|3[0-3]5)';
const PERFIL = '([2-8][05])';
// No meio de uma frase so vale "/", "\", "-" ou "x": virgula/ponto/espaco no meio da frase e preco ("vi por 195,50 na
// outra loja" virava 195/50 — conferencia 22/10). Com virgula/ponto/espaco so vale a mensagem que e SO a medida (RE_SO_LP).
const RE_LP = new RegExp(`(?<![\\d$.,])${LP}\\s*[/\\\\\\-xX]\\s*${PERFIL}(?![\\d])`);
// "195/55" sozinho na mensagem (pode ter "pneu"/"medida" e pontuacao em volta).
const RE_SO_LP = new RegExp(`^\\s*(?:(?:o|um|uma|pneu|pneus|medida|e|é|eh|:)\\s*)*${LP}\\s*[/\\\\\\-.,xX ]\\s*${PERFIL}\\s*[.!?]*\\s*$`, 'i');
const ARO = '(1[2-9]|2[0-4])';
const RE_ARO = new RegExp(`\\baro\\s*:?\\s*${ARO}\\b`, 'i');
const RE_ARO_R = new RegExp(`(?<![\\w$])r\\s?${ARO}\\b`, 'i');
const RE_SO_NUMERO_ARO = new RegExp(`^\\s*(?:aro\\s*)?${ARO}\\s*[.!?]*\\s*$`, 'i');

function textoDoCliente(conteudo: unknown): string {
  let t = String(conteudo ?? '').trim();
  if (PLACEHOLDER_MIDIA.test(t)) return '';
  // Clique no anuncio: a 1a linha e o TITULO do anuncio ("Pneu ARO 13 a partir de...") — nao e o cliente falando.
  if (LEGENDA_ANUNCIO.test(t)) t = t.split('\n').slice(1).join('\n').trim();
  return t;
}

export function larguraPerfilDoTexto(texto: string): string | null {
  const t = normalizarTextoMedida(texto);
  // Mensagem com preco ("vi por R$ 195,50") nao e medida.
  if (/R\$|\breais\b/i.test(t)) return null;
  const m = RE_LP.exec(t) || RE_SO_LP.exec(t);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Ultima ocorrencia na mensagem: "tenho aro 15 mas quero aro 16" / "vi o aro 13, tem aro 16?" = 16 (conferencia 22/10).
function ultimaOcorrencia(re: RegExp, t: string): string | null {
  const g = new RegExp(re.source, 'gi');
  let ult: string | null = null;
  for (let m = g.exec(t); m; m = g.exec(t)) ult = m[1] as string;
  return ult;
}

export function aroDoTexto(texto: string): string | null {
  const t = normalizarTextoMedida(texto);
  return ultimaOcorrencia(RE_ARO, t) || ultimaOcorrencia(RE_ARO_R, t) || (RE_SO_NUMERO_ARO.exec(t)?.[1] ?? null);
}

// Medidas INTEIRAS que o cliente escreveu de fato nas mensagens da rajada (o que a leitura da IA "completou" nao conta).
export function medidasEscritasNaRajada(rajada: string[]): string[] {
  return rajada.flatMap((r) => extrairMedidasDoTexto(textoDoCliente(r)));
}

// A loja acabou de perguntar o aro ("Qual é o aro? Na 195/55 eu tenho...")? Entao o numero que vem e resposta a isso.
export function lojaAcabouDePerguntarAro(anteriores: MensagemConversa[]): boolean {
  for (let i = anteriores.length - 1; i >= 0; i--) {
    if (anteriores[i]?.role !== 'assistant') continue;
    return /qual\s+(?:é|e|eh)?\s*o\s+aro\b/i.test(String(anteriores[i]?.content ?? ''));
  }
  return false;
}

// A rajada e SO a largura/perfil ("195/55", "pneu 195/55")? Entao o que falta e so o aro.
export function rajadaSoLarguraPerfil(rajada: string[]): string | null {
  const t = normalizarTextoMedida(rajada.join(' ').trim());
  const m = RE_SO_LP.exec(t);
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * Junta largura/perfil e aro ditos pelo cliente em mensagens diferentes (mais recente vence).
 * `rajada` = mensagens do cliente ainda sem resposta (ja limpas); `anteriores` = o resto da conversa.
 * Para no primeiro texto do cliente que ja tem a medida inteira (ela vale mais que pedacos mais antigos).
 */
export function juntarMedidaRecente(rajada: string[], anteriores: MensagemConversa[], minutosDesdeUltimaDaLoja: number | null): PartesDaMedida {
  const textos: Array<{ texto: string; daRajada: boolean }> = [];
  for (let i = rajada.length - 1; i >= 0; i--) textos.push({ texto: textoDoCliente(rajada[i]), daRajada: true });
  const clienteVoltando = minutosDesdeUltimaDaLoja != null && minutosDesdeUltimaDaLoja > JANELA_MINUTOS_MEDIDA;
  if (!clienteVoltando) {
    const ini = Math.max(0, anteriores.length - JANELA_MENSAGENS_MEDIDA);
    for (let i = anteriores.length - 1; i >= ini; i--) {
      const m = anteriores[i];
      if (m?.role === 'assistant') {
        if (LOJA_DEU_PRECO.test(String(m.content ?? ''))) break;
        continue;
      }
      if (m?.role === 'user') textos.push({ texto: textoDoCliente(m.content), daRajada: false });
    }
  }
  let larguraPerfil: string | null = null;
  let aro: string | null = null;
  let lpDaRajada = false;
  let aroDaRajada = false;
  for (const { texto, daRajada } of textos) {
    if (!texto) continue;
    if (extrairMedidasDoTexto(texto).length) break;
    if (!larguraPerfil) {
      const lp = larguraPerfilDoTexto(texto);
      if (lp) { larguraPerfil = lp; lpDaRajada = daRajada; }
    }
    if (!aro) {
      const a = aroDoTexto(texto);
      if (a) { aro = a; aroDaRajada = daRajada; }
    }
    if (larguraPerfil && aro) break;
  }
  const medida = larguraPerfil && aro ? `${larguraPerfil}/${aro}` : null;
  return {
    larguraPerfil,
    aro,
    medida,
    daRajada: (!!larguraPerfil && lpDaRajada) || (!!aro && aroDaRajada),
    larguraPerfilNaRajada: !!larguraPerfil && lpDaRajada,
  };
}

// Aros que a loja tem pra essa largura/perfil (da tabela), ex.: "195/55" -> ["15", "16"].
export function arosDaTabela(larguraPerfil: string): string[] {
  const aros = new Set<string>();
  for (const item of TABELA_PRECOS_GP) {
    const p = String(item.medida || '').split('/');
    if (p.length === 3 && `${p[0]}/${p[1]}` === larguraPerfil) aros.add(p[2] as string);
  }
  return [...aros].sort((a, b) => Number(a) - Number(b));
}

// So falta o aro: pede SO o aro (nunca o texto generico com exemplo, nunca "o numero do meio").
export function partesPedirAro(larguraPerfil: string): string[] {
  const aros = arosDaTabela(larguraPerfil);
  const lista = aros.length === 0 ? '' : aros.length === 1 ? ` Na ${larguraPerfil} eu tenho aro ${aros[0]}.` : ` Na ${larguraPerfil} eu tenho aro ${aros.slice(0, -1).join(', aro ')} e aro ${aros[aros.length - 1]}.`;
  return [`Show, ${larguraPerfil}! 👍`, `Qual é o aro?${lista}`];
}

// TROCA DE ARO DEPOIS DO PRECO (23/10): a loja cotou 185/65/15 e o cliente manda so "aro 16" / "e aro 16?" /
// "tem aro 16?". A IA livre respondia "pode repetir, por favor?". O pedido e a MESMA largura/perfil no aro novo.
// Rajada que e SO o aro (com "e", "o", "no", "tem", "quanto fica"... em volta). Precisa da palavra "aro" (ou "r16"):
// um "16" solto depois de um preco pode ser outra coisa.
const RE_SO_TROCA_ARO = /^(?:(?:e|o|a|no|na|do|da|pro|pra|para|em|tem|teria|tens|vcs|voc[eê]s|voce|quanto|fica|sai|qual|valor|pre[cç]o)\s+)*(?:aro\s*|r\s?)(1[2-9]|2[0-2])(?:\s+(?:tem|tamb[eé]m|tem\s+tamb[eé]m|quanto\s+fica|quanto\s+sai|fica\s+quanto|sai\s+quanto))?\s*[?.!]*$/i;

export function aroPedidoSozinho(rajada: string[]): string | null {
  const t = rajada.map((r) => textoDoCliente(r)).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const m = RE_SO_TROCA_ARO.exec(t);
  return m ? (m[1] as string) : null;
}

// Medidas da tabela naquele aro, as mais parecidas com a largura/perfil de referencia primeiro (no maximo `max`),
// devolvidas na ordem crescente de medida.
export function medidasDoAroParecidas(aro: string, larguraRef: number, perfilRef: number, max = 4): string[] {
  const vistas = new Set<string>();
  const doAro: Array<{ medida: string; dist: number; ordem: number }> = [];
  TABELA_PRECOS_GP.forEach((item, ordem) => {
    const p = String(item.medida || '').split('/');
    if (p.length !== 3 || p[2] !== aro || vistas.has(item.medida)) return;
    vistas.add(item.medida);
    const dist = Math.abs(Number(p[0]) - larguraRef) / 10 + Math.abs(Number(p[1]) - perfilRef) / 5;
    doAro.push({ medida: item.medida, dist, ordem });
  });
  return doAro
    .sort((a, b) => a.dist - b.dist || a.ordem - b.ordem)
    .slice(0, max)
    .map((x) => x.medida)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export interface TrocaDeAro { aro: string; larguraPerfil: string; medida: string | null; opcoes: string[] }

/**
 * `medidaCotada` = medida que a loja acabou de cotar ("185/65/15"). Se a rajada e so outro aro:
 * medida = mesma largura/perfil no aro novo, quando a tabela tem; senao opcoes = ate 4 medidas que a loja tem nesse aro.
 * null = nao e troca de aro (rajada com outra coisa, mesmo aro, medida cotada invalida).
 */
export function trocaDeAroDepoisDoPreco(rajada: string[], medidaCotada: string): TrocaDeAro | null {
  const aro = aroPedidoSozinho(rajada);
  const p = String(medidaCotada || '').split('/');
  if (!aro || p.length !== 3 || !p[0] || !p[1] || p[2] === aro) return null;
  const larguraPerfil = `${p[0]}/${p[1]}`;
  const candidata = `${larguraPerfil}/${aro}`;
  if (TABELA_PRECOS_GP.some((i) => i.medida === candidata)) return { aro, larguraPerfil, medida: candidata, opcoes: [] };
  return { aro, larguraPerfil, medida: null, opcoes: medidasDoAroParecidas(aro, Number(p[0]), Number(p[1])) };
}

// A loja nao tem a mesma largura/perfil no aro novo: diz isso e pede a medida completa, mostrando o que tem no aro.
export function partesPedirMedidaDoAro(troca: TrocaDeAro): string[] {
  const { aro, larguraPerfil, opcoes } = troca;
  const lista = opcoes.length === 0 ? '' : opcoes.length === 1 ? ` No aro ${aro} eu tenho a ${opcoes[0]}.` : ` No aro ${aro} eu tenho ${opcoes.slice(0, -1).join(', ')} e ${opcoes[opcoes.length - 1]}.`;
  return [`Na ${larguraPerfil} eu não tenho aro ${aro}.`, `Qual é a medida completa do seu pneu aro ${aro}?${lista}`];
}
