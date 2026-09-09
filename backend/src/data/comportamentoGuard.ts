// TRAVA DE COMPORTAMENTO (04/09). Prompt e texto — o modelo pode "esquecer" uma regra no
// meio de uma conversa longa, ainda mais com um prompt deste tamanho (30 mil+ caracteres).
// Pro preco isso ja foi resolvido com uma trava de codigo (precoGuard.ts). Aqui vale o
// mesmo principio pro erro mais grave achado em conversa real: o robo prometer uma
// TRANSFERENCIA que ele nao tem como cumprir.
//
// Caso real (03/09): cliente pediu por nome "Lazaro" duas vezes; o robo respondeu
// "Certo — vou transferir voce para o Lazaro. Um instante, por favor." — uma promessa
// vazia, o robo nao tem nenhum mecanismo de transferencia instantanea.
//
// Ampliado 04/09: achado em conversa real (Paulinho) o robo disse "Seus dados ja foram
// compartilhados com a nossa equipe para agilizar seu atendimento" — mesma mentira (nao
// existe equipe nenhuma por tras), so que com uma frase diferente que passou direto pelos
// padroes antigos. Sempre que aparecer, ampliar aqui em vez de confiar so no prompt.

const PADROES_PROMESSA_FALSA: RegExp[] = [
  /vou\s+(te\s+)?transferir/i,
  /vou\s+(te\s+)?conectar\s+(voc[eê]\s+)?(com|para)/i,
  /j[aá]\s+conectei\s+voc[eê]/i,
  /um\s+instante[,]?\s+vou\s+(chamar|buscar|ver)/i,
  /vou\s+chamar\s+(o|a)\s+\w+/i,
  /compartilhad[oa]s?\s+com\s+(a\s+)?(nossa\s+)?equipe/i,
  /encaminh(ei|ado|ada)\s+.{0,25}equipe/i,
  /repass(ei|ado|ada)\s+.{0,25}equipe/i,
  /(nossa\s+)?equipe\s+(vai|ira|vao|vao)\s+(te\s+)?(confirmar|responder|atender|entrar)/i,
];

/** true = a resposta contem uma promessa de transferencia/equipe que o robo nao pode cumprir. */
export function prometeuTransferenciaFalsa(partes: string[]): boolean {
  const texto = partes.join(' ');
  return PADROES_PROMESSA_FALSA.some((re) => re.test(texto));
}

// TRAVA 2 (04/09): repescar modelo/ano do carro, "marca preferida" ou "servico adicional"
// DEPOIS de ja ter dado o preco. Achado em 4 conversas reais diferentes no mesmo dia (John,
// Fiat Mobi, Paulinho) mesmo com a regra ja escrita quase palavra por palavra no prompt,
// com o exemplo exato do erro marcado como PROIBIDO. Prompt sozinho nao segura — o modelo
// insiste em voltar pra esse roteiro generico de "coletar dados antes de fechar".
// A loja so vende UMA marca (GP Premium) e so tem os servicos fixos (montagem gratis,
// balanceamento R$25/roda) — entao essas perguntas NUNCA fazem sentido, em nenhum contexto.
// Por isso a remocao aqui e CIRURGICA (corta so a frase ruim) em vez de descartar a resposta
// inteira feito o guard de promessa falsa: o preco que veio junto costuma estar certo e
// vale a pena preservar, ao inves de arriscar um preco diferente numa segunda tentativa.

const PADROES_REPERGUNTA_PROIBIDA: RegExp[] = [
  /marca\s+preferida/i,
  /outra\s+marca\s+em\s+mente/i,
  /essa\s+marca\s+que\s+voc[eê]\s+prefere/i,
  /servi[cç]os?\s+adicion(al|ais)/i,
  /qual\s+o\s+\*?modelo\*?\s+e\s+o\s+\*?ano\*?\s+d[oe]\s+(seu\s+)?(carro|ve[ií]culo)/i,
  /qual\s+o\s+\*?ano\*?\s+d[oe]\s+(seu\s+)?(carro|ve[ií]culo)/i,
];

/**
 * Remove, frase por frase, qualquer pedaco de uma "parte" (bolha de mensagem) que repita a
 * pergunta de modelo/ano/marca preferida/servico adicional depois do preco. Se a bolha inteira
 * for so essa pergunta, ela e removida da lista. Preserva o resto do texto (preco etc) intacto.
 */
export function removerReperguntaPosPreco(partes: string[]): string[] {
  const resultado: string[] = [];
  for (const parte of partes) {
    const linhas = parte.split(/\n+/);
    const linhasLimpas = linhas.filter((linha) => !PADROES_REPERGUNTA_PROIBIDA.some((re) => re.test(linha)));
    const textoLimpo = linhasLimpas.join('\n').trim();
    if (textoLimpo) resultado.push(textoLimpo);
  }
  return resultado;
}

// TRAVA 3 (09/09): repetir a MESMA mensagem palavra por palavra.
// Achado nas conversas do dia: o Cesar recebeu o mesmo paragrafo de garantia, o mesmo
// link de video e o mesmo "Quando voce consegue vir ate a loja?" duas vezes em 5
// minutos; outro cliente recebeu a mesma frase as 13:55 e 13:56 sem ter dito nada no
// meio. Regra em texto ("nao repita") nao segura — aqui a repeticao e cortada no codigo,
// comparando com o que o robo JA disse nesta conversa.

function normalizarParaComparar(texto: string): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // tira acento
    .replace(/[^a-z0-9]+/g, ' ')         // tira pontuacao/emoji
    .trim();
}

/**
 * Remove as partes que o robo JA mandou recentemente nesta conversa.
 * So considera mensagens com algum corpo (>= 40 chars normalizados): confirmacoes
 * curtas ("certo", "perfeito") podem repetir sem incomodar.
 */
export function removerRepeticaoRecente(partes: string[], jaDitas: string[]): string[] {
  const recentes = new Set(
    jaDitas
      .slice(-8)
      .map(normalizarParaComparar)
      .filter((t) => t.length >= 40),
  );
  const saida: string[] = [];
  for (const parte of partes) {
    const norma = normalizarParaComparar(parte);
    if (norma.length >= 40 && recentes.has(norma)) continue; // ja falou isso
    saida.push(parte);
    if (norma.length >= 40) recentes.add(norma); // nem repetir dentro do mesmo envio
  }
  return saida;
}
