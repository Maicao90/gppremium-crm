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

// TRAVA 5 (19/09): o robo NAO envia foto de pneu e nunca pode dizer que vai enviar.
// Caso real: cliente escreveu "Foto", o robo respondeu "Claro — segue foto do pneu..." sem mandar
// nada e, mais tarde, perguntou "Conseguiu ver a foto?". Dono: "ele nem deve falar que vai mandar foto".
const PADROES_PROMESSA_FOTO: RegExp[] = [
  /segue\s+(a\s+|uma\s+|as\s+)?(foto|imagem)/i,
  /(vou|posso|irei)\s+(te\s+)?(mandar|enviar|passar)\s+(a\s+|uma\s+|as\s+)?(foto|imagem)/i,
  /(te\s+)?(mando|envio|passo|enviei|mandei)\s+(a\s+|uma\s+|as\s+)?(foto|imagem)/i,
  /(conseguiu|viu)\s+(ver\s+)?(a\s+)?(foto|imagem)/i,
  /foto\s+(do|desse|deste)\s+pneu\s*(:|segue|abaixo)/i,
];

/** Corta, linha por linha, qualquer trecho que prometa/anuncie o envio de foto. Preserva o resto. */
export function removerPromessaDeFoto(partes: string[]): string[] {
  const resultado: string[] = [];
  for (const parte of partes) {
    const linhasLimpas = parte.split(/\n+/).filter((linha) => !PADROES_PROMESSA_FOTO.some((re) => re.test(linha)));
    const textoLimpo = linhasLimpas.join('\n').trim();
    if (textoLimpo) resultado.push(textoLimpo);
  }
  return resultado;
}

// Marcas de ACAO que a IA livre escreve dentro do texto ([AGENDAR_VISITA: ...], [LEMBRAR: ...], video...). As travas 6 e 7
// fatiam o texto por frase: sem proteger isso, cortavam a frase que carregava a tag (agendamento perdido) ou partiam
// [LEMBRAR: ... texto="Oi! ..."] no meio, e o pedaco cru ia parar no WhatsApp do cliente (revisao 21/09).
const TAG_DE_ACAO = /\[(?:AGENDAR_VISITA|LEMBRAR|ENVIAR_VIDEO|VIDEO|TRANSFERIR_HUMANO)[^\]]*\]/gi;
function separarTags(parte: string): { texto: string; tags: string } {
  const tags = (parte.match(TAG_DE_ACAO) || []).join(' ');
  return { texto: parte.replace(TAG_DE_ACAO, ' ').replace(/[ \t]{2,}/g, ' ').trim(), tags };
}
function refazerParte(mantidas: string[], tags: string): string {
  return [mantidas.join(' ').trim(), tags].filter(Boolean).join(' ');
}

// O cliente falou de horario, dia ou hora (ou de quando vai passar): ai o horario da loja e resposta, nao intromissao.
const CLIENTE_FALOU_DE_HORARIO = /hor[aá]rio|horas?\b|\bhrs?\b|\bhs?\b|aberto|aberta|\babr(e|em|o)\b|\bfecha|funcion|atende|expediente|almo[cç]|agora|manh[aã]|s[aá]bado|domingo|feriado|segunda|ter[cç]a|quarta|quinta|sexta|\bhoje\b|\bhj\b|amanh[aã]|\bquando\b|\bdia\b|semana|\bcedo\b|\btarde\b|\bnoite\b|\d\s?h\b|\d\s?:\s?\d/i;

// A mensagem do cliente e SO um agradecimento / "ok" / despedida (sem pergunta e sem falar de horario/dia).
const PALAVRAS_DE_AGRADECIMENTO = /obrigad|brigad|valeu|vlw|agradec|\btchau\b|at[eé] (mais|logo)|\bblz\b|beleza|\bok\b|combinado|entendi|vou pensar|depois eu (vejo|falo)|\bfalou\b|\bflw\b/i;
/** true = o cliente so agradeceu / disse ok / se despediu (sem pergunta, sem horario, sem dia). */
export function pareceAgradecimento(textoDoCliente: string): boolean {
  const t = String(textoDoCliente || '');
  return PALAVRAS_DE_AGRADECIMENTO.test(t) && !/\?/.test(t) && !CLIENTE_FALOU_DE_HORARIO.test(t);
}

// TRAVA 6 (21/09): nao citar o HORARIO da loja quando o cliente so agradeceu/disse ok/se despediu.
// Achado nas conversas reais de hoje: depois de "OK obrigado" o robo acrescentava sozinho "Nosso horario:
// segunda a sexta, das 08h as 18h..." — o horario correto entrou no prompt em 19/09 e a IA passou a usa-lo
// como assunto de despedida. Revisao adversarial (21/09): a versao inicial cortava o horario sempre que o
// cliente nao usava uma lista fechada de palavras ("ate q hrs?", "posso ir depois do almoco?") e deixava o
// cliente SEM RESPOSTA. Agora a trava so age quando a mensagem do cliente e SO agradecimento (pareceAgradecimento);
// qualquer pergunta/horario/dia desliga a trava. Horario perguntado normalmente vem do fluxo (categoria "horario").
const PADROES_HORARIO_DA_LOJA: RegExp[] = [
  /\b(segunda|seg)\b[^.!?\n]{0,25}\b(sexta|sex)\b/i,
  /\bs[aá]bados?\b[^.!?\n]{0,30}\d{1,2}\s?(h\b|:)/i,
  /\b\d{1,2}\s?h(\s?\d{2})?\s*(as|às|a|-|até|ate)\s*\d{1,2}\s?h/i,
  /\bnosso\s+hor[aá]rio\b/i,
  /\bhor[aá]rio\s+de\s+funcionamento\b/i,
];

/** Corta as frases que citam o horario da loja quando o cliente so agradeceu. Preserva o resto (e as tags de acao). */
export function removerHorarioNaoPedido(partes: string[], textoDoCliente: string): string[] {
  if (!pareceAgradecimento(textoDoCliente)) return partes;
  const resultado: string[] = [];
  for (const parte of partes) {
    const { texto, tags } = separarTags(parte);
    const frases = texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim());
    const mantidas = frases.filter((f) => !PADROES_HORARIO_DA_LOJA.some((re) => re.test(f)));
    if (mantidas.length === frases.length) { resultado.push(parte); continue; }
    const refeita = refazerParte(mantidas, tags);
    if (refeita) resultado.push(refeita);
  }
  return resultado;
}

// TRAVA 7 (21/09): o pino da localizacao ja foi mandado nesta conversa. A IA livre continuava escrevendo
// "Segue nossa localizacao!" (+ a marca do pino, que o sistema ja barra) e o cliente recebia so a frase solta,
// sem pino nenhum (achado em conversa real de hoje, 2x seguidas). Tira a marca e as frases que so anunciam o pino.
const ANUNCIO_DE_PINO = /^\s*(segue|aqui\s+est[aá]|aqui\s+vai|olha|te\s+(mando|envio|passo)|vou\s+(te\s+)?(mandar|enviar|passar)|mando|envio)(?![a-zA-Z])[^.!?:\n]{0,40}\b(localiza[cç][aã]o|endere[cç]o|pino|mapa)\b[^.!?\n]{0,15}$/i;

/** Remove a marca [ENVIAR_LOCALIZACAO] e as frases que apenas anunciam o pino (ex.: "Segue nossa localização!"). Preserva as tags de acao. */
export function removerLocalizacaoRepetida(partes: string[]): string[] {
  const resultado: string[] = [];
  for (const parte of partes) {
    const semMarca = parte.replace(/\[ENVIAR_LOCALIZACAO\]/gi, '').trim();
    const { texto, tags } = separarTags(semMarca);
    const frases = texto.split(/(?<=[.!?:])\s+|\n+/).filter((f) => f.trim());
    const mantidas = frases.filter((f) => !ANUNCIO_DE_PINO.test(f.replace(/[.!:\s]+$/, '')));
    const refeita = mantidas.length === frases.length ? semMarca : refazerParte(mantidas, tags);
    if (refeita) resultado.push(refeita);
  }
  return resultado;
}

// TRAVA 3 (09/09): repetir a MESMA mensagem palavra por palavra.
// Achado nas conversas do dia: o Cesar recebeu o mesmo paragrafo de garantia, o mesmo
// link de video e o mesmo "Quando voce consegue vir ate a loja?" duas vezes em 5
// minutos; outro cliente recebeu a mesma frase as 13:55 e 13:56 sem ter dito nada no
// meio. Regra em texto ("nao repita") nao segura — aqui a repeticao e cortada no codigo,
// comparando com o que o robo JA disse nesta conversa.

export function normalizarParaComparar(texto: string): string {
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


// TRAVA 4 (18/09): decisao de PAUSAR a conversa por anti-loop, junto (nao so cortar
// bolha) — reusa a mesma normalizacao de texto da TRAVA 3 acima. Motivado pelo caso
// real "Pwa" (5 falas reais do cliente geraram 9 bolhas do robo — a contagem antiga,
// que contava BOLHA em vez de TURNO do cliente, quase pausou uma conversa legitima).
// Fica aqui (nao em botAtendimentoService.ts) de proposito: e logica PURA, sem
// import de banco/servidor, entao um teste standalone pode importar so isto sem
// risco de disparar efeito colateral nenhum.
//
// Dois eixos independentes:
// 1) VOLUME: mensagens DISTINTAS do cliente (waId unico) na janela — mede turno real
//    de conversa, nao bolha do robo; serve de rede de seguranca pra loop nao-textual
//    (ex.: troca de midia em circulo).
// 2) CONTEUDO: pega a assinatura real de loop, independente de volume:
//    a) ECO: o cliente "manda" de volta um texto que o proprio robo tinha acabado de
//       mandar (eco de plataforma / bot do outro lado ecoando) — nao e cliente digitando.
//    b) REPETICAO PROPRIA: o robo repete a mesma frase 3+ vezes entre as ultimas 6
//       respostas — esta girando sem progredir a conversa, mesmo mudando de turno.
// Repeticao de conteudo pausa NA HORA (prova direta de loop, nao espera volume alto);
// volume fica como rede de seguranca pro que os dois sub-sinais de conteudo nao cobrem.
export const JANELA_ECO_MS = 2 * 60 * 1000;
const MIN_REPETICOES_PROPRIAS = 3;
const QTD_RESPOSTAS_ANALISADAS = 6;
// 22/10: era 8 — cliente real digitando rapido (preco, local, remold, quantidade, "?", "obrigado")
// bateu 8 em 5 min e ficou 12h pausado como "outro robo". Gente nao passa de ~15 mensagens em 5 min.
const LIMITE_TURNOS_JANELA = 16;

export interface MsgAntiLoop {
  waId?: string | null;
  texto: string;
  timestamp: Date;
}

export type MotivoAntiLoop = 'anti_loop_eco' | 'anti_loop_repeticao' | 'anti_loop_volume';

/**
 * mensagensCliente: mensagens do cliente (fromMe:false) DENTRO da janela de 5min.
 * respostasBotComMargem: respostas do robo (fromMe:true, enviadoPorId:'bot') desde
 *   (inicio da janela de 5min - JANELA_ECO_MS), pra dar margem ao lookback do eco.
 * desdeJanela: inicio da janela de 5min (filtra quais respostas do robo entram na
 *   checagem de repeticao propria).
 */
export function decidirAntiLoop(
  mensagensCliente: MsgAntiLoop[],
  respostasBotComMargem: MsgAntiLoop[],
  desdeJanela: Date,
): { pausar: boolean; motivo: MotivoAntiLoop | null } {
  // EIXO VOLUME: turnos reais do cliente (mensagens DISTINTAS por waId), nao bolhas do robo.
  const turnosReais = new Set(mensagensCliente.filter((m) => m.waId).map((m) => m.waId)).size;

  // EIXO CONTEUDO a) ECO: alguma mensagem do cliente, normalizada (>=40 chars), bate com
  // uma resposta que o PROPRIO robo mandou nos JANELA_ECO_MS antes dela.
  const eco = mensagensCliente.some((m) => {
    const normCliente = normalizarParaComparar(m.texto);
    if (normCliente.length < 40) return false;
    const limiteEco = m.timestamp.getTime() - JANELA_ECO_MS;
    return respostasBotComMargem.some((r) => {
      const t = r.timestamp.getTime();
      if (t >= m.timestamp.getTime() || t < limiteEco) return false;
      return normalizarParaComparar(r.texto) === normCliente;
    });
  });

  // EIXO CONTEUDO b) REPETICAO PROPRIA: entre as ultimas 6 respostas do robo na janela
  // de 5min, 3+ iguais entre si (>=40 chars) = girando na mesma frase sem progredir.
  const ultimasRespostas = respostasBotComMargem
    .filter((r) => r.timestamp.getTime() >= desdeJanela.getTime())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, QTD_RESPOSTAS_ANALISADAS);
  const contagem = new Map<string, number>();
  for (const r of ultimasRespostas) {
    const norm = normalizarParaComparar(r.texto);
    if (norm.length < 40) continue;
    contagem.set(norm, (contagem.get(norm) || 0) + 1);
  }
  const repeticaoPropria = [...contagem.values()].some((n) => n >= MIN_REPETICOES_PROPRIAS);

  if (eco) return { pausar: true, motivo: 'anti_loop_eco' };
  if (repeticaoPropria) return { pausar: true, motivo: 'anti_loop_repeticao' };
  if (turnosReais >= LIMITE_TURNOS_JANELA) return { pausar: true, motivo: 'anti_loop_volume' };
  return { pausar: false, motivo: null };
}