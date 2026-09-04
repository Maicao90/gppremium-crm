// TRAVA DE COMPORTAMENTO (04/09). Prompt e texto — o modelo pode "esquecer" uma regra no
// meio de uma conversa longa, ainda mais com um prompt deste tamanho (30 mil+ caracteres).
// Pro preco isso ja foi resolvido com uma trava de codigo (precoGuard.ts). Aqui vale o
// mesmo principio pro erro mais grave achado em conversa real: o robo prometer uma
// TRANSFERENCIA que ele nao tem como cumprir.
//
// Caso real (03/09): cliente pediu por nome "Lazaro" duas vezes; o robo respondeu
// "Certo — vou transferir voce para o Lazaro. Um instante, por favor." — uma promessa
// vazia, o robo nao tem nenhum mecanismo de transferencia instantanea.

const PADROES_PROMESSA_FALSA: RegExp[] = [
  /vou\s+(te\s+)?transferir/i,
  /vou\s+(te\s+)?conectar\s+(voc[eê]\s+)?(com|para)/i,
  /j[aá]\s+conectei\s+voc[eê]/i,
  /um\s+instante[,]?\s+vou\s+(chamar|buscar|ver)/i,
  /vou\s+chamar\s+(o|a)\s+\w+/i,
];

/** true = a resposta contem uma promessa de transferencia que o robo nao pode cumprir. */
export function prometeuTransferenciaFalsa(partes: string[]): boolean {
  const texto = partes.join(' ');
  return PADROES_PROMESSA_FALSA.some((re) => re.test(texto));
}
