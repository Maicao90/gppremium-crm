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
const RE_LP = new RegExp(`(?<![\\d$])${LP}\\s*[/\\\\\\-.,xX]\\s*${PERFIL}(?![\\d])`);
const RE_LP_ESPACO = new RegExp(`^\\s*(?:pneu\\s*|medida\\s*)*${LP}\\s+${PERFIL}\\s*[.!?]*\\s*$`, 'i');
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
  const m = RE_LP.exec(t) || RE_LP_ESPACO.exec(t);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function aroDoTexto(texto: string): string | null {
  const t = normalizarTextoMedida(texto);
  const m = RE_ARO.exec(t) || RE_ARO_R.exec(t) || RE_SO_NUMERO_ARO.exec(t);
  return m ? (m[1] as string) : null;
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
