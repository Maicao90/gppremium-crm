// CASOS REAIS de 19-20/11 (dono 23/11: "nao era para o robo agir assim" / "a ia se confundiu").
const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content });
const T = (j) => (j.partes || []).concat(j.partesAntesDoInstante || []).join(' \n ');
const PEDIR = 'Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro que eu vejo pra você 😉';
module.exports = [
  { nome: 'P1 anuncio "Compre 3, leve 4" + frase padrao -> so pede a medida, SEM o texto da base de troca',
    msgs: [U('📢 [Anúncio] Compre 3, leve 4\n\nOlá! Posso ter mais informações sobre isso?')],
    ok: (j) => !/base de troca|189/i.test(T(j)) && /medida/i.test(T(j)) },
  { nome: 'P2 "Vim pelo anúncio e gostaria de mais informações" -> so pede a medida, SEM base de troca',
    msgs: [U('Olá, Vim Pelo Anúncio e Gostaria De Mais Informações, Por Favor.')],
    ok: (j) => !/base de troca|189/i.test(T(j)) && /medida/i.test(T(j)) },
  { nome: 'P3 cliente pergunta do preco do anuncio (189) -> continua explicando a base de troca',
    msgs: [U('Bom dia, o pneu do anúncio é 189 mesmo?')],
    ok: (j) => /base de troca/i.test(T(j)) },
  { nome: 'P4 anuncio + "Qual essa numeração do 17?" -> pergunta o carro, sem a lista inteira do aro',
    msgs: [U('📢 [Anúncio] Preço justo, sem serviço inventado\n\nOlá! Posso ter mais informações sobre isso?'), U('Qual essa numeração do 17?')],
    ok: (j) => (j.chaves || []).includes('aro_sem_medida') && /carro/i.test(T(j)) && !/R\$/.test(T(j)) },
  { nome: 'P5 "Pegout 207 / Ano 2011 / Aonde fica a loja" -> localizacao E pede a medida do carro',
    msgs: [U('📢 [Anúncio] Compre 3, leve 4\n\nOlá! Posso ter mais informações sobre isso?'), A('Oiê, tudo bem? 😊'), A(PEDIR), U('Pegout 207'), U('Ano 2011'), U('Aonde fica a loja de vcs')], estado: 'aguardando_medida',
    ok: (j) => (j.chaves || []).includes('localizacao') && /lateral do pneu|medida/i.test(T(j)) },
  { nome: 'P6 "Virtus" depois de pedir o carro -> medidas do Virtus com preco',
    msgs: [U('Qual valor do pneu?'), A(PEDIR), U('Virtus')], estado: 'aguardando_medida',
    ok: (j) => /Virtus/.test(T(j)) && /205\/5[05]\/1[67]/.test(T(j)) },
  { nome: 'P7 Paulo 13/11: foto do pneu + "Qual valor / 04 pneus" com medida velha guardada -> NAO cota a medida velha',
    msgs: [A('Temos os 4 pneus *195/65/15* da marca *GP Premium* saem por *R$ 986,70 à vista* (valor total).'), U('Bom dia'), U('Qual valor'), U('04 pneus')],
    estado: 'preco_confirmado', dados: { medida: '195/65/15', quantidade: 4 }, imagem: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
    ok: (j) => !/195\/65\/15/.test(T(j)) },
  { nome: 'P8 "tem pneu 15 pro Gol?" continua indo pela tabela de carros (aro + carro)',
    msgs: [U('tem pneu aro 14 pro Gol?')],
    ok: (j) => !(j.chaves || []).includes('aro_sem_medida') },
];
