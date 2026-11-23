// ERROS REAIS de 23/11 (auditoria das respostas a clientes reais).
const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content });
const T = (j) => (j.partes || []).concat(j.partesAntesDoInstante || []).join(' \n ');
const QTD = 'Quantos pneus você vai precisar? ';
const P1 = 'Temos o pneu *215/65/16* da marca *GP Premium* está saindo por *R$ 349,00 à vista*.';
const P4 = 'Temos os 4 pneus *215/65/16* da marca *GP Premium* saem por *R$ 1.396,00 à vista* (valor total).';
const atend = (j) => j.acaoTipo === 'PASSAR_ATENDENTE' || (j.chaves || []).includes('assunto_atendente');
module.exports = [
  { nome: 'Q1 "4 pneus / O valor parcela ?" -> da o valor da parcela (156,60 em 10x, total 1.566,04), sem "cada"', msgs: [A(P1), A(QTD), U('4 pneus'), U('O valor parcela ?')], estado: 'preco_confirmado', dados: { medida: '215/65/16' },
    ok: (j) => /10x de \*?R\$ 156,60/.test(T(j)) && /1\.566,04/.test(T(j)) && !/ cada,/.test(T(j)) },
  { nome: 'Q2 "Parcelando qual o valor ?" depois do total de 4 -> da a parcela (156,60)', msgs: [A(P1), U('4 pneus'), A(P4), U('Parcelando qual o valor ?')], estado: 'preco_confirmado', dados: { medida: '215/65/16', quantidade: 4 },
    ok: (j) => /156,60/.test(T(j)) },
  { nome: 'Q3 "Passa cartao, divide?" SEM medida -> resposta generica (10x), sem inventar valor', msgs: [U('Passa cartão,divide?')],
    ok: (j) => /10x/.test(T(j)) && !/R\$ ?\d/.test(T(j)) },
  { nome: 'Q4 "Voce tem o pneu Landspider 185/70-14? Preciso de 4 pneus." -> atendente (outra marca), sem cotar GP', msgs: [U('Bom dia! Você tem o pneu Landspider 185/70-14? Preciso de 4 pneus.')],
    ok: (j) => atend(j) && !/GP Premium/.test(T(j)) },
  { nome: 'Q5 "vcs tem michelin 175/70/14?" -> atendente', msgs: [U('vcs tem michelin 175/70/14?')], ok: atend },
  { nome: 'Q6 "quanto ta o 175/70/14 GP Premium" continua cotando', msgs: [U('quanto ta o 175/70/14 GP Premium')],
    ok: (j) => !atend(j) && /279/.test(T(j)) },
  { nome: 'Q7 "Goodyear e remold?" (cita outra marca sem perguntar se tem) nao vira atendente por engano? -> pergunta de marca vai pra atendente tambem', msgs: [U('Qual a diferença do GP Premium pra Goodyear?')],
    ok: (j) => (j.partes || []).length > 0 || atend(j) },
];
