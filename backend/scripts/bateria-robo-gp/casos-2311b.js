// ACHADOS da revisao diaria do Cerebro (17-22/11) que viraram regra fixa em 23/11b.
const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content });
const T = (j) => (j.partes || []).concat(j.partesAntesDoInstante || []).join(' \n ');
const PEDIR = 'Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro que eu vejo pra você 😉';
const QTD = 'Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉';
const atend = (j) => j.acaoTipo === 'PASSAR_ATENDENTE' || (j.chaves || []).includes('assunto_atendente');
module.exports = [
  { nome: 'R1 M&G "215/60 A16" -> le o aro 16, nao pergunta o aro de novo', msgs: [A(PEDIR), U('215/60 A16')], estado: 'aguardando_medida',
    ok: (j) => !/Qual [eé] o aro/i.test(T(j)) && /215\/60\/16|16/.test(T(j)) },
  { nome: 'R2 💥 "pneu 15, a numeração dele é o 195/55" -> 195/55/15', msgs: [U('Estou precisando de um pneu 15. O pneu 15, a numeração dele é o 195/55.')],
    ok: (j) => !/Qual [eé] o aro/i.test(T(j)) && /195\/55\/15/.test(T(j)) },
  { nome: 'R3 Decio "18565 15 ... pague tres leva quatro" -> cota SEM oferecer base de troca', msgs: [U('Preciso de quatro pneus 185/65 15 tá naquela promoção de pague três leva quatro?')],
    ok: (j) => /185\/65\/15/.test(T(j)) && !/base de troca/i.test(T(j)) },
  { nome: 'R4 cliente cita 199 do anuncio antigo -> ainda explica a base de troca', msgs: [U('o 185/65/15 é 199 mesmo?')],
    ok: (j) => /base de troca/i.test(T(j)) },
  { nome: 'R5 resposta automatica de outra empresa -> silencio', msgs: [U('Olá!tudo bem? L A Transporte agradece o seu contato. No momento estou dirigindo🚗, irei responder com a maior brevidade')],
    ok: (j) => (j.partes || []).length === 0 },
  { nome: 'R6 Jeova "4" + "Obrigado!" depois de "Quantos pneus?" -> cota os 4', msgs: [U('Quero cotar o pneu 165/70 R13 GP Premium.'), A('Temos o pneu *165/70/13* da marca *GP Premium* está saindo por *R$ 239,00 à vista*.'), A(QTD), U('4'), U('Obrigado!')], estado: 'preco_confirmado', dados: { medida: '165/70/13' },
    ok: (j) => /4 pneus|os 4/i.test(T(j)) && /R\$/.test(T(j)) && !/Tranquilo/i.test(T(j)) },
  { nome: 'R7 eliene "Ja comprei / So quero fazer a troca" -> atendente', msgs: [A(PEDIR), U('Para vocês trocarem 4 pneus da Toro'), U('Já comprei'), U('Só quero fazer a troca')], estado: 'aguardando_medida',
    ok: atend },
  { nome: 'R8 Joao Neto "vende a unidade ou so o par?" -> vende por unidade', msgs: [A('Temos o pneu *205/75/16* da marca *GP Premium* está saindo por *R$ 439,00 à vista*.'), U('esse VC b vende a unidade ou só o par ?')], estado: 'preco_confirmado', dados: { medida: '205/75/16' },
    ok: (j) => /unidade/i.test(T(j)) },
  { nome: 'R9 weliton "E em relação a montagem / Como funciona?" -> montagem, nao horario', msgs: [A('Temos o pneu *175/65/14* da marca *GP Premium* está saindo por *R$ 249,00 à vista*.'), U('E em relação a montagem'), U('Como funciona?')], estado: 'preco_confirmado', dados: { medida: '175/65/14' },
    ok: (j) => /montagem|monta/i.test(T(j)) && !/8h|08h/i.test(T(j)) },
  { nome: 'R10 Douglas "vcs vende pneus no boleto?" -> pagamento presencial', msgs: [U('vcs vende pneus no boleto ?')],
    ok: (j) => /boleto/i.test(T(j)) && /presencial/i.test(T(j)) },
  { nome: 'R11 Tiago "185/60 R15 84H ou 88H?" -> atendente', msgs: [A('Temos o pneu *185/60/15* da marca *GP Premium* está saindo por *R$ 249,00 à vista*.'), U('185/60 R15 84H ou 88H?')], estado: 'preco_confirmado', dados: { medida: '185/60/15' },
    ok: atend },
  { nome: 'R12 Luck "Guarda meus pneus aí, eu tô indo" -> separa mediante pagamento', msgs: [A('Temos o pneu *175/70/14* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.'), U('Guarda meus pneus aí, eu tô indo.')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => /mediante o pagamento/i.test(T(j)) && !/Combinado/i.test(T(j)) },
  { nome: 'R13 Jerry "amanha voces trabalham, hein?" -> horario, sem "Combinado"', msgs: [A('Temos o pneu *175/70/14* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.'), U('Bom dia. Amanhã é feriado, amanhã vocês trabalham, hein?')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => /S[aá]bado|08h/i.test(T(j)) && !/Combinado/i.test(T(j)) },
  { nome: 'R14 wilson "Vocês já estão fechados" -> responde o horario', msgs: [U('Vocês já estão fechados')],
    ok: (j) => (j.partes || []).length > 0 && /S[aá]bado|08h|abert|fechad/i.test(T(j)) },
  { nome: 'R15 Vitor "Precisa não / Ele ganhou uns meia vida" -> desistencia, sem discurso de qualidade', msgs: [A('Temos o pneu *175/70/14* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.'), U('Precisa não'), U('Ele ganhou uns meia vida')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => !/borracha padr[aã]o europeu/i.test(T(j)) && (j.chaves || []).length > 0 },
  { nome: 'R16 "quero trocar os 4 pneus do meu carro" NAO vai pra atendente (nao e pneu comprado fora)', msgs: [U('quero trocar os 4 pneus do meu carro, 175/70/14')],
    ok: (j) => !atend(j) && /175\/70\/14/.test(T(j)) },
  { nome: 'R17 "175/70 R13 82T" (medida com indice) continua cotando', msgs: [U('quanto ta o 175/70 R13 82T')],
    ok: (j) => !atend(j) && /175\/70\/13/.test(T(j)) },
];
