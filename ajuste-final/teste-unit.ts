// Testes das funcoes puras dos 3 ajustes (rodar no LAB com ts-node). Sem banco, sem rede.
import { decidirRetomadaForaDaLista, MensagemDesdeAPausa } from '/root/ant-lab/src/data/retomadaForaDaLista';
import { trocaDeAroDepoisDoPreco, partesPedirMedidaDoAro, aroPedidoSozinho } from '/root/ant-lab/src/data/medidaJuntada';
import { removerParcelamentoRepetidoEJustificativa } from '/root/ant-lab/src/data/travaPosOrcamento';

let ok = 0, falhou = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`OK   ${nome} -> ${a}`); } else { falhou++; console.log(`FALHA ${nome}\n     obtido:   ${a}\n     esperado: ${b}`); }
}

// ---------- Ajuste 1 ----------
const agora = new Date('2026-10-23T15:00:00Z');
const daqui12h = new Date(agora.getTime() + 11.9 * 3600_000);
const t = (min: number) => new Date(agora.getTime() - min * 60_000);
const cli = (texto: string, min = 1): MensagemDesdeAPausa => ({ fromMe: false, enviadoPorId: null, texto, tipo: 'texto', timestamp: t(min) });
const robo = (texto: string, min = 2): MensagemDesdeAPausa => ({ fromMe: true, enviadoPorId: 'bot', texto, tipo: 'texto', timestamp: t(min) });
const pessoa = (texto: string, min = 2): MensagemDesdeAPausa => ({ fromMe: true, enviadoPorId: null, texto, tipo: 'texto', timestamp: t(min) });
const dec = (motivoPausa: string | null, pausadoAte: Date | null, msgs: MensagemDesdeAPausa[]) => {
  const d = decidirRetomadaForaDaLista({ pausadoAte, motivoPausa, agora, mensagensDesdeAPausa: msgs });
  return [d.liberar, d.motivo, d.medida || null];
};
confere('A1 medida da tabela -> libera', dec('fora_da_lista', daqui12h, [cli('e 175/70/13?')]), [true, 'medida_da_tabela', '175/70/13']);
confere('A2 medida da tabela escrita "185 65 r15" -> libera', dec('fora_da_lista', daqui12h, [cli('???', 3), cli('185 65 r15')]), [true, 'medida_da_tabela', '185/65/15']);
confere('A3 medida fora da tabela -> continua', dec('fora_da_lista', daqui12h, [cli('e 185/65/16?')]), [false, 'sem_medida_da_tabela', null]);
confere('A4 "vocês têm?" -> continua', dec('fora_da_lista', daqui12h, [cli('vocês têm?')]), [false, 'sem_medida_da_tabela', null]);
confere('A5 "???" -> continua', dec('fora_da_lista', daqui12h, [cli('???')]), [false, 'sem_medida_da_tabela', null]);
confere('A6 pausa manual do painel -> nao mexe', dec('atendimento_manual', daqui12h, [cli('175/70/13')]), [false, 'outro_motivo', null]);
confere('A7 pausa ∞ (painel) -> nao mexe', dec('atendimento_manual', new Date('2099-01-01T00:00:00Z'), [cli('175/70/13')]), [false, 'outro_motivo', null]);
confere('A8 fora_da_lista mas longa demais (nao e a automatica) -> nao mexe', dec('fora_da_lista', new Date('2099-01-01T00:00:00Z'), [cli('175/70/13')]), [false, 'pausa_longa', null]);
confere('A9 eco de atendente -> nao mexe', dec('eco_externo', daqui12h, [cli('175/70/13')]), [false, 'outro_motivo', null]);
confere('A10 anti-loop/curriculo -> nao mexe', dec('curriculo', daqui12h, [cli('175/70/13')]), [false, 'outro_motivo', null]);
confere('A11 atendente escreveu depois da pausa -> nao mexe', dec('fora_da_lista', daqui12h, [pessoa('vou ver aqui pra vc', 5), cli('175/70/13')]), [false, 'atendente_escreveu', null]);
confere('A12 atendente mandou audio depois da pausa -> nao mexe', dec('fora_da_lista', daqui12h, [{ fromMe: true, enviadoPorId: null, texto: '', tipo: 'audio', timestamp: t(4) }, cli('175/70/13')]), [false, 'atendente_escreveu', null]);
confere('A13 so mensagens do robo/automatica desde a pausa -> libera', dec('fora_da_lista', daqui12h, [robo('Só um instante que eu vou verificar aqui pra você, tá bem?', 6), { fromMe: true, enviadoPorId: null, texto: '🙋🏼‍♀️', tipo: 'texto', timestamp: t(5) }, cli('175/70/13')]), [true, 'medida_da_tabela', '175/70/13']);
confere('A14 pausa ja venceu -> nao e caso (conversa ja liberada)', dec('fora_da_lista', t(1), [cli('175/70/13')]), [false, 'nao_pausada', null]);
confere('A15 sem pausa -> nao e caso', dec(null, null, [cli('175/70/13')]), [false, 'nao_pausada', null]);
confere('A16 cita medida fora + medida da tabela -> libera pela da tabela', dec('fora_da_lista', daqui12h, [cli('nao tem 185/65/16? e 195/55/16?')]), [true, 'medida_da_tabela', '195/55/16']);

// ---------- Ajuste 2 ----------
confere('B1 "aro 16"', aroPedidoSozinho(['aro 16']), '16');
confere('B2 "e aro 16?"', aroPedidoSozinho(['e aro 16?']), '16');
confere('B3 "tem aro 16?"', aroPedidoSozinho(['tem aro 16?']), '16');
confere('B4 "e no aro 14?"', aroPedidoSozinho(['e no aro 14?']), '14');
confere('B5 "16" solto nao conta', aroPedidoSozinho(['16']), null);
confere('B6 "4 pneus aro 16" nao conta', aroPedidoSozinho(['4 pneus aro 16']), null);
confere('B7 "aro 16 em 10x?" nao conta', aroPedidoSozinho(['aro 16 em 10x quanto fica?']), null);
confere('B8 195/55/15 -> aro 16 existe', trocaDeAroDepoisDoPreco(['aro 16'], '195/55/15'), { aro: '16', larguraPerfil: '195/55', medida: '195/55/16', opcoes: [] });
const t185 = trocaDeAroDepoisDoPreco(['e aro 16?'], '185/65/15');
confere('B9 185/65/15 -> aro 16 nao existe, ate 4 opcoes', t185, { aro: '16', larguraPerfil: '185/65', medida: null, opcoes: ['195/55/16', '205/55/16', '205/60/16', '215/65/16'] });
confere('B10 texto pedindo a medida', t185 && partesPedirMedidaDoAro(t185), ['Na 185/65 eu não tenho aro 16.', 'Qual é a medida completa do seu pneu aro 16? No aro 16 eu tenho 195/55/16, 205/55/16, 205/60/16 e 215/65/16.']);
confere('B11 mesmo aro -> nao e troca', trocaDeAroDepoisDoPreco(['aro 15'], '185/65/15'), null);
const t19 = trocaDeAroDepoisDoPreco(['aro 19'], '185/65/15');
confere('B12 aro sem nenhuma medida na tabela', t19 && partesPedirMedidaDoAro(t19), ['Na 185/65 eu não tenho aro 19.', 'Qual é a medida completa do seu pneu aro 19?']);

// ---------- Ajuste 3 ----------
const anterioresMarcelo = [
  { role: 'user', content: 'Bom dia' },
  { role: 'assistant', content: 'Oiê, tudo bem? 😊' },
  { role: 'assistant', content: 'Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro que eu vejo pra você 😉' },
  { role: 'user', content: 'Pneu aro 14 para VW Gol' },
  { role: 'assistant', content: 'Pro Gol aro 14, temos o pneu *175/65/14* da marca *GP Premium* saindo por *R$ 249,00 à vista*.' },
  { role: 'assistant', content: 'Se preferir, você pode parcelar em até 10x no cartão!' },
  { role: 'assistant', content: 'Se o seu for de outra medida no aro 14, como o 175/70/14 dos Gol mais antigos, me avisa que eu te passo o valor dela.' },
];
const respostaReal = [
  'Pra Gol 2010, a medida original mais comum é a *175/70/14*. Nela, o pneu *GP Premium* sai por *R$ 279,00 à vista*.',
  'O 175/65/14 que te passei antes é mais dos Gol mais novos.',
  'Se preferir, você pode parcelar em até 10x no cartão! Quando você consegue passar aqui na loja?',
];
confere('C1 caso real Marcelo', removerParcelamentoRepetidoEJustificativa(respostaReal, anterioresMarcelo).partes, [
  'Pra Gol 2010, a medida original mais comum é a *175/70/14*. Nela, o pneu *GP Premium* sai por *R$ 279,00 à vista*.',
  'Quando você consegue passar aqui na loja?',
]);
confere('C2 parcelamento ainda nao dito -> fica', removerParcelamentoRepetidoEJustificativa(['Sai por *R$ 279,00 à vista*.', 'Se preferir, você pode parcelar em até 10x no cartão!'], anterioresMarcelo.slice(0, 5)).partes, ['Sai por *R$ 279,00 à vista*.', 'Se preferir, você pode parcelar em até 10x no cartão!']);
confere('C3 so sobraria nada -> mantem a 1a bolha original', removerParcelamentoRepetidoEJustificativa(['Você pode parcelar em até 10x no cartão!'], anterioresMarcelo).partes, ['Você pode parcelar em até 10x no cartão!']);
confere('C4 "que eu te mandei antes" sai', removerParcelamentoRepetidoEJustificativa(['O valor que eu te mandei antes era do aro 13. Esse sai por R$ 279,00.'], []).partes, ['Esse sai por R$ 279,00.']);
confere('C5 parcelamento dito ha mais de 10 msgs da loja -> fica', removerParcelamentoRepetidoEJustificativa(['Dá pra parcelar em até 10x no cartão!'], [{ role: 'assistant', content: 'Se preferir, você pode parcelar em até 10x no cartão!' }, ...Array.from({ length: 10 }, (_, i) => ({ role: 'assistant', content: `msg ${i}` }))]).partes, ['Dá pra parcelar em até 10x no cartão!']);
confere('C6 resposta sem nada disso -> intacta', removerParcelamentoRepetidoEJustificativa(['A gente fica na Avenida Perimetral.'], anterioresMarcelo).partes, ['A gente fica na Avenida Perimetral.']);

confere('C7 lab 2a tentativa: "Se o seu for da medida 175/65/14, o valor continua..." sai', removerParcelamentoRepetidoEJustificativa(['Pro Gol 2010, a medida original mais comum é a *175/70/14*. Esse a gente tem da marca *GP Premium* por *R$ 279,00 à vista*. Se o seu for da medida 175/65/14, o valor continua R$ 249,00 à vista.'], anterioresMarcelo, ['2010']).partes, ['Pro Gol 2010, a medida original mais comum é a *175/70/14*. Esse a gente tem da marca *GP Premium* por *R$ 279,00 à vista*.']);
confere('C8 cliente perguntou da medida antiga -> fica', removerParcelamentoRepetidoEJustificativa(['O 175/70/14 sai por R$ 279,00 à vista. O 175/65/14 continua R$ 249,00 à vista.'], anterioresMarcelo, ['e o 175/65/14 ainda ta 249?']).partes, ['O 175/70/14 sai por R$ 279,00 à vista. O 175/65/14 continua R$ 249,00 à vista.']);
confere('C9 comparacao sem tom de justificativa -> fica', removerParcelamentoRepetidoEJustificativa(['O 175/70/14 sai por R$ 279,00 à vista.', 'O 175/65/14 sai por R$ 249,00 à vista.'], anterioresMarcelo, ['qual o mais barato?']).partes, ['O 175/70/14 sai por R$ 279,00 à vista.', 'O 175/65/14 sai por R$ 249,00 à vista.']);
confere('C10 lab: preco + parcelamento na mesma frase -> preco fica, parcelamento sai', removerParcelamentoRepetidoEJustificativa(['Pro Gol 2010 aro 14, a medida original é a *175/70/14*. Ela sai por *R$ 279,00 à vista* e dá pra parcelar em até 10x no cartão. O 175/65/14 de R$ 249,00 que te passei antes também entra no aro 14, mas a original do seu Gol é a 175/70/14.', 'Quantos pneus você precisa?'], anterioresMarcelo, ['2010']).partes, ['Pro Gol 2010 aro 14, a medida original é a *175/70/14*. Ela sai por *R$ 279,00 à vista*.', 'Quantos pneus você precisa?']);
confere('C11 justificativa colada no preco NOVO -> sai so a justificativa', removerParcelamentoRepetidoEJustificativa(['O *175/70/14* sai por R$ 279,00, que é o valor certo no lugar do que te passei antes.'], anterioresMarcelo, ['2010']).partes, ['O *175/70/14* sai por R$ 279,00.']);
confere('C13 lab: "Corrigindo o que te passei antes: ..." + "O 175/65/14 de R$ 249,00 é de Gol mais novo."', removerParcelamentoRepetidoEJustificativa(['Pro Gol 2010 aro 14, a medida original é *175/70/14*. Corrigindo o que te passei antes: nessa medida o pneu *GP Premium* sai por *R$ 279,00 à vista*. O 175/65/14 de R$ 249,00 é de Gol mais novo. Quando você consegue passar aqui pra gente fazer a troca?'], anterioresMarcelo, ['2010']).partes, ['Pro Gol 2010 aro 14, a medida original é *175/70/14*. Nessa medida o pneu *GP Premium* sai por *R$ 279,00 à vista*. Quando você consegue passar aqui pra gente fazer a troca?']);
confere('C14 lab: "...R$ 279,00 a vista na GP Premium, entao vale esse valor no lugar da medida que te passei antes."', removerParcelamentoRepetidoEJustificativa(['Pro Gol 2010 aro 14, a medida original é a *175/70/14*. Ela sai por *R$ 279,00 à vista* na marca *GP Premium*, então vale esse valor no lugar da medida que te passei antes.', 'Quando você consegue passar aqui na loja?'], anterioresMarcelo, ['2010']).partes, ['Pro Gol 2010 aro 14, a medida original é a *175/70/14*. Ela sai por *R$ 279,00 à vista* na marca *GP Premium*.', 'Quando você consegue passar aqui na loja?']);
confere('C15 sem ", " antes da justificativa e com preco -> frase inteira fica (preco nunca some)', removerParcelamentoRepetidoEJustificativa(['Sai por R$ 279,00 no lugar do que te passei antes.'], anterioresMarcelo, ['2010']).partes, ['Sai por R$ 279,00 no lugar do que te passei antes.']);
confere('C12 cortar tiraria a medida principal -> nao corta nada', removerParcelamentoRepetidoEJustificativa(['A 175/70/14 que te passei antes é a original.', 'Quer agendar?'], anterioresMarcelo, ['2010']).partes, ['A 175/70/14 que te passei antes é a original.', 'Quer agendar?']);

console.log(`\n${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
