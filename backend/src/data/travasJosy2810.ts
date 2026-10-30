// TRAVAS DOS PEDIDOS DA JOSY (27-28/10/2026) — codigo puro, sem IA, sem I/O.
// Cada regra veio de uma conversa real que ela mandou em print (ver relatorio 28/10):
//  1. "dinheiro" em negrito no desconto ("os cidadaos entendem que e pix").
//  2. Parcelamento so quando o cliente pede (3 prints: Kwid 27/10 08:03, Fox 27/10 13:11, 175/65/14 28/10 08:08).
//  3. "o pneu aro 14 / ta quanto?" e "tudo bem / aro 15" -> nao despeja a lista do aro: pergunta o carro.
//  4. Sem repeticao: bolha (que nao e preco) igual a uma que a loja mandou ha pouco nao sai de novo; o robo nao
//     responde "ok/obrigado" quando nao chegou mensagem nova do cliente (monologo 28/10 07:22, Ubiratan).
//  5. Candidato a vaga (curriculo) no historico: o robo nao entra (28/10 08:11, candidato recebeu "qual e o seu carro?").
//  6. "Nao" respondendo a mensagem de retomada ("Ainda esta precisando?"): agradece e para, sem pedir a medida (Lindomar 27/10).

// ---------- 1. negrito em "dinheiro" ----------
// So no sentido de pagamento ("em dinheiro", "no dinheiro", "pagamento em dinheiro"). "seu dinheiro de volta" (garantia)
// fica como esta. Nao mexe se a palavra ja esta dentro de um trecho em negrito (*...*).
export function negritoDinheiro(parte: string): string {
  const s = String(parte || '');
  if (/^\[[A-Z_]+(:[^\]]*)?\]$/.test(s.trim())) return s; // marcador de audio/pino
  return s.replace(/\b(em|no)\s+dinheiro\b/gi, (trecho, prefixo: string, offset: number) => {
    const antes = s.slice(0, offset);
    const asteriscos = (antes.match(/\*/g) || []).length;
    if (asteriscos % 2 === 1) return trecho; // ja esta dentro de *...*
    return `${prefixo} *dinheiro*`;
  });
}

// ---------- 2. parcelamento so quando pedido ----------
// O cliente pediu/perguntou de parcelamento, cartao, juros ou numero de vezes (agora ou nas ultimas mensagens dele).
const PEDIU_PARCELAMENTO = /parcel|cart[aã]o|\bvezes\b|\d{1,2}\s*x\b|\bx\s*\d{1,2}\b|juros|cr[eé]dito|d[eé]bito|prazo|divid|presta[cç]|\bem quantas\b|forma(s)? de pagamento|como (eu )?pago|como (fica|e|é) (o|a) pagamento|pagamento/i;
export function clientePediuParcelamento(textosCliente: string[]): boolean {
  return textosCliente.some((t) => PEDIU_PARCELAMENTO.test(String(t || '')));
}

// Frase (ou trecho de frase) que oferece parcelamento sem ninguem ter pedido.
const FRASE_PARCELAMENTO = /(\bparcel|\bno cart[aã]o\b|\bcart[aã]o de cr[eé]dito|d[aá] (pra|para) parcelar|pode parcelar|parcelar em at[eé]|parcelamos|em at[eé] 10x|no cart[aã]o,? em \d+x|em \d+x (fica|sai)|se preferir o cart[aã]o|\d+x no cart[aã]o|sem juros|com jurinho)/i;
// Trecho no fim da frase: ", e da pra parcelar em ate 10x no cartao" / " e da pra parcelar..." (mantem o comeco).
const CLAUSULA_PARCELAMENTO = /,?\s*(e\s+)?(tamb[eé]m\s+)?d[aá] (pra|para) parcelar em at[eé] 10x( no cart[aã]o)?( tamb[eé]m)?/gi;

function cortarFrasesParcelamento(bolha: string): string {
  // 1) tira so a clausula quando ela vem pendurada numa frase que tem outra informacao
  let s = bolha.replace(CLAUSULA_PARCELAMENTO, '').replace(/^[\s,.;:!]+/, '').replace(/\s+([.!?,])/g, '$1').replace(/([.!?])[.!?,]+/g, '$1');
  // 2) frases inteiras que ainda falam de parcelamento saem
  const frases = s.split(/(?<=[.!?])\s+/);
  const ficam = frases.filter((f) => !FRASE_PARCELAMENTO.test(f) && !/^(se preferir|ou se preferir|tamb[eé]m)[\s,.!]*$/i.test(f.trim()));
  s = ficam.join(' ').trim();
  // "Todas da marca *GP Premium*" ficou sem pontuacao no fim
  if (s && !/[.!?…)*😊😉👍]$/u.test(s)) s += '.';
  // sobrou so pontuacao / conectivo
  if (!/[\p{L}\p{N}]/u.test(s)) return '';
  return s;
}

// Marcador de audio "[ENVIAR_AUDIO:arq!N]" substitui as N bolhas seguintes: essas bolhas nao podem ser cortadas
// (o numero N deixaria de bater) — o audio vai no lugar delas.
function indicesProtegidosPorAudio(partes: string[]): Set<number> {
  const prot = new Set<number>();
  partes.forEach((p, i) => {
    const m = /^\[ENVIAR_AUDIO:[^\]!]+!(\d+)\]$/i.exec(String(p).trim());
    if (m) for (let k = 1; k <= Number(m[1]); k++) prot.add(i + k);
  });
  return prot;
}

export function removerParcelamentoNaoPedido(partes: string[], textosCliente: string[]): { partes: string[]; cortadas: string[] } {
  if (clientePediuParcelamento(textosCliente)) return { partes, cortadas: [] };
  const prot = indicesProtegidosPorAudio(partes);
  const saida: string[] = [];
  const cortadas: string[] = [];
  partes.forEach((p, i) => {
    const t = String(p || '');
    if (prot.has(i) || /^\[[A-Z_]+(:[^\]]*)?\]$/.test(t.trim()) || !(FRASE_PARCELAMENTO.test(t) || CLAUSULA_PARCELAMENTO.test(t))) {
      CLAUSULA_PARCELAMENTO.lastIndex = 0;
      saida.push(p);
      return;
    }
    CLAUSULA_PARCELAMENTO.lastIndex = 0;
    const limpa = cortarFrasesParcelamento(t);
    cortadas.push(t);
    if (limpa) saida.push(limpa);
  });
  return { partes: saida, cortadas };
}

// ---------- 3. aro sem medida na rajada ----------
// "O pneu aro 14" + "Ta quanto?", "Tudo bem" + "Aro 15", "Qual o valor do 15": so o ARO (nenhuma medida) e o resto e
// cumprimento ou pergunta de preco. Devolve o aro, ou null.
export function aroSemMedidaNaRajada(rajada: string[]): string | null {
  const texto = rajada.map((r) => String(r || '')).join('\n');
  if (/\d{3}\s*[/\\ x-]?\s*\d{2}/.test(texto)) return null; // tem largura/perfil (medida inteira ou pedaco)
  const aros = new Set<string>();
  for (const m of texto.matchAll(/\baro\s*(1[2-9]|2[0-2])\b/gi)) aros.add(m[1]!);
  // "valor do 15" / "do 14" / "o 15" quando a mensagem fala de preco
  for (const m of texto.matchAll(/\b(?:do|no|o)\s+(1[2-9]|2[0-2])\b/gi)) if (/valor|pre[cç]o|quanto|t[aá]/i.test(texto)) aros.add(m[1]!);
  // mensagem que e so o numero ("15")
  for (const r of rajada) { const m = /^\s*(1[2-9]|2[0-2])\s*[?.!]*\s*$/.exec(String(r || '')); if (m) aros.add(m[1]!); }
  if (aros.size !== 1) return null;
  const aro = [...aros][0]!;
  // o resto tem que ser so cumprimento / pergunta de preco (senao e outra pergunta e o fluxo normal decide).
  // Por palavra (o \b do JS nao entende acento: "tá" escapava).
  const resto = semAcentoMin(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((p) => p !== aro && !PALAVRAS_LIVRES.has(p));
  return resto.length ? null : aro;
}
function semAcentoMin(s: string): string { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
const PALAVRAS_LIVRES = new Set(('oi oii ola bom boa dia tarde noite tudo bem bom td certo blz beleza e ai opa por favor pf pfv obrigado obrigada ' +
  'ta esta fica sai custa quanto qual quais o a os as do da de no na pra para valor valores preco precos pneu pneus me passa manda seria saindo ' +
  'ficando voces vcs tem aro um uma quero queria saber gostaria informar informa').split(' '));

// ---------- 4. sem repeticao ----------
function normalizar(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*_~]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
}
// Chaves que so sao "gesto" (nao respondem pergunta): se tudo que sobrou foi cortado por repeticao, o robo fica quieto.
export const CHAVES_GESTO = ['agradecimento', 'saudacao', 'saudacao_retorno', 'pedir_medida', 'pedir_medida_repetida', 'visita_confirmada', 'visita_sem_dia'];

// Tira bolhas que a loja ja mandou igualzinho nas ultimas `janela` mensagens dela. Bolha com preco (R$) nao e cortada
// (o cliente que pede de novo o valor recebe o valor), nem marcador de audio/pino.
export function removerBolhasRepetidas(partes: string[], ultimasDaLoja: string[], janela = 8): { partes: string[]; cortadas: string[] } {
  const recentes = new Set(ultimasDaLoja.slice(-janela).flatMap((m) => String(m || '').split(/\n{2,}/)).map(normalizar).filter((x) => x.length >= 12));
  const recentesInteiras = ultimasDaLoja.slice(-janela).map(normalizar);
  const prot = indicesProtegidosPorAudio(partes);
  const saida: string[] = [];
  const cortadas: string[] = [];
  partes.forEach((p, i) => {
    const t = String(p || '');
    const n = normalizar(t);
    const ehMarcador = /^\[[A-Z_]+(:[^\]]*)?\]$/.test(t.trim());
    const repetida = !ehMarcador && !prot.has(i) && !/R\$\s*\d/.test(t) && n.length >= 12 && (recentes.has(n) || recentesInteiras.includes(n));
    if (repetida) cortadas.push(t); else saida.push(p);
  });
  return { partes: saida, cortadas };
}

// ---------- 5. candidato a vaga ----------
// Mesmo padrao do whatsapp-crm (ehCandidatoAVaga) + "candidatar", "vaga para o departamento", "processo seletivo" (28/10).
const REGEX_CANDIDATO = /(curr[ií]cul(o|um)|\bc\.v\.?\b|\bcv\b|contratando|candidat(ar|o|a|ei|ura)|processo seletivo|entrevista|oportunidade de (trabalho|emprego)|\bvagas?\s+(que|aberta|abertas|dispon[ií]ve(l|is)|na loja|a[ií](?![a-z])|ainda|est[aá])|\bsobre a vaga|\bvagas?\s+(para|pra|do|da|no|na)\s+(o\s+|a\s+)?(departamento|setor|[aá]rea|financeiro|servi[cç]os|auxiliar|cargo|fun[cç][aã]o)|vaga(s)? de (emprego|trabalho|auxiliar|mec[aâ]nic|vendedor|atendente|borracheir|motorista|estagi|servi)|interesse (na|em uma|numa) vaga|(alguma|tem|h[aá]) vaga (de|pra|para) (emprego|trabalh)|fazer parte d[ae] (sua |vossa )?(empresa|equipe)|trabalhar (com voc[eê]s|a[ií] na|na (empresa|loja) de voc)|\bemprego\b)/i;
export function ehCandidatoAVaga(textos: string[]): boolean {
  return textos.some((t) => REGEX_CANDIDATO.test(String(t || '')));
}

// ---------- 6. "nao" a retomada ----------
const NEGATIVA = /^(n[aã]o+|nao obrigad[oa]|n[aã]o,? obrigad[oa]|n[aã]o preciso( mais)?|n[aã]o,? (ja|j[aá]) (comprei|resolvi|troquei)|j[aá] (comprei|resolvi|troquei)|no momento n[aã]o|por enquanto n[aã]o|agora n[aã]o|n[aã]o no momento|n|nn|nops|negativo)[\s!.,😊👍🙏]*$/i;
export function negouRetomada(rajada: string[], ultimaDaLoja: string): boolean {
  if (!/ainda est[aá] precisando\??|ainda precisa\b|ainda tem interesse/i.test(String(ultimaDaLoja || ''))) return false;
  return rajada.length > 0 && rajada.every((t) => NEGATIVA.test(String(t || '').trim()));
}
