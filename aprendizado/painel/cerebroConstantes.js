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
// De onde veio o ensinamento (Licao.origem na API)
export const ORIGEM = { dono: 'você ensinou', revisao: 'veio da revisão', josy: 'jeito da Josy' };
// Marcador de audio do robo numa parte da resposta: [ENVIAR_AUDIO:nome] ou [ENVIAR_AUDIO:nome!N] (N = textos que ele substitui)
export const RE_MARCADOR_AUDIO = /^\[ENVIAR_AUDIO:([a-z0-9_-]+)(?:!(\d{1,2}))?\]$/i;
export const paragrafos = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
// Preco e medida nao podem ficar em texto fixo (vai igual pra todo cliente): preco sai da tabela.
const RE_PRECO = /R\$\s?\d|\b\d{2,5}(?:[.,]\d{2})?\s?(?:reais|conto)\b/i;
const RE_MEDIDA = /\b\d{3}\s?\/\s?\d{2}\b|\b\d{3}-\d{2}\b|\baro\s?1[2-9]\b|\bR\s?1[2-9]\b/i;
export function avisosPrecoMedida(texto) {
  const t = String(texto || '');
  return [...(RE_PRECO.test(t) ? ['preço'] : []), ...(RE_MEDIDA.test(t) ? ['medida'] : [])];
}
