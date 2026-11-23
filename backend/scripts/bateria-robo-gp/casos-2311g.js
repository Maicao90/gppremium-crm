// FERIADO (23/11g): casos reais de 19-20/11 + dias normais que nao podem mudar.
const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content });
const T = (j) => (j.partes || []).concat(j.partesAntesDoInstante || []).join(' \n ');
const PRECO = 'Temos o pneu *175/70/14* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.';
module.exports = [
  { nome: 'G1 20/11 (feriado) "Estão funcionando hoje?" -> diz que e feriado, NAO diz "ate as 18h"', agora: '2026-11-20T13:00:00Z', msgs: [U('Tudo bom?'), U('Estão funcionando hoje?')],
    ok: (j) => /feriado/i.test(T(j)) && !/18h/i.test(T(j)) },
  { nome: 'G2 19/11 "amanha voces trabalham, hein?" (amanha 20/11 feriado) -> feriado, sem "Combinado"', agora: '2026-11-19T13:00:00Z', msgs: [A(PRECO), U('Bom dia. Amanhã é feriado, amanhã vocês trabalham, hein?')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => /feriado/i.test(T(j)) && !/Combinado/i.test(T(j)) },
  { nome: 'G3 20/11 "blz to indo ai agora" -> nao confirma, feriado', agora: '2026-11-20T13:00:00Z', msgs: [A(PRECO), U('blz to indo ai agora')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => /feriado/i.test(T(j)) && !/Te esperamos|Combinado/i.test(T(j)) },
  { nome: 'G4 25/12 Natal "voces abrem hoje?" -> feriado', agora: '2026-12-25T13:00:00Z', msgs: [U('voces abrem hoje?')],
    ok: (j) => /feriado/i.test(T(j)) },
  { nome: 'G5 dia normal (segunda 10h) "Estão funcionando hoje?" continua "abertos agora"', agora: '2026-11-23T13:00:00Z', msgs: [U('Estão funcionando hoje?')],
    ok: (j) => /abertos agora/i.test(T(j)) && !/feriado/i.test(T(j)) },
  { nome: 'G6 dia normal "amanha eu passo ai" (terca) continua confirmando', agora: '2026-11-23T13:00:00Z', msgs: [A(PRECO), U('amanhã eu passo aí')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => !/feriado/i.test(T(j)) && (j.partes || []).length > 0 },
  { nome: 'G7 feriado mas o cliente so pede preco (sem falar de horario) -> responde o preco normal', agora: '2026-11-20T13:00:00Z', msgs: [U('quanto ta o 175/70/14')],
    ok: (j) => /279/.test(T(j)) && !/feriado/i.test(T(j)) },
];
