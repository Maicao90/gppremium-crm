// Constantes do "Cerebro do robo" usadas na pagina e no Mapa do cerebro (sairam de pages/CerebroRobo.jsx, 22/10).
export const ACOES = {
  responder: 'Responder com este texto',
  atendente: 'Passar pra atendente ("só um instante" + etiqueta)',
  silencio: 'Não responder',
  orientar: 'Orientar a IA (ela escreve seguindo a orientação)',
};
export const COR_GRAVIDADE = { alta: '#E8252C', media: '#d9892a', baixa: '#8b94a8' };
export const TIPOS = {
  preco: 'Preço', repetiu_pergunta: 'Perguntou de novo', nao_entendeu: 'Não entendeu', contradisse_atendente: 'Contradisse a atendente',
  atropelou_atendente: 'Atropelou a atendente', inventou: 'Inventou', fora_de_contexto: 'Fora de contexto', sem_resposta: 'Sem resposta',
  nao_era_cliente: 'Não era cliente', outro: 'Outro',
};
export const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const vazio = { situacao: '', acao: 'responder', resposta: '', lojas: [], ativo: true };
