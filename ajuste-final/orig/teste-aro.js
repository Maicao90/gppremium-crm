// Testes (a)-(f) da medida em pedacos no bot-service do LABORATORIO (3011). simular:false = IA de verdade.
const URL = 'http://127.0.0.1:3011/gerar-resposta';
const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const ANUNCIO = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nQual o valor do aro 16';
const ANUNCIO_PADRAO = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nOlá! Tenho interesse e queria mais informações, por favor.';
const PERGUNTA = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const SAUD = 'Oi, tudo bem? 😊';
// [nome, messages, estadoPreco, dadosPreco, minutosDesdeUltimaDaLoja]
const casos = [
  ['REAL 1a rodada: anuncio "Qual o valor do aro 16" + "195/55"', [U(ANUNCIO), U('195/55')], 'sem_estado', '{}', null],
  ['REAL 2a rodada: "Aro 16" (195/55 na rodada anterior)', [U(ANUNCIO), U('195/55'), A(PERGUNTA), U('Aro 16')], 'aguardando_medida', '{}', 1],
  ['(a) "195/55" -> robo -> "Aro 16" + "195/55"', [U(ANUNCIO_PADRAO), A(SAUD), A(PERGUNTA), U('195/55'), A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.'), U('Aro 16'), U('195/55')], 'aguardando_medida', '{}', 1],
  ['(a2) "195/55" -> robo pede aro -> "Aro 16"', [U(ANUNCIO_PADRAO), A(SAUD), A(PERGUNTA), U('195/55'), A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.'), U('Aro 16')], 'aguardando_medida', '{}', 1],
  ['(b) "aro 16" -> robo pergunta carro -> "195/55"', [U('aro 16'), A('Show, aro 16! 👍'), A('Qual é o carro? Já te passo a medida certa e o valor.'), U('195/55')], 'aguardando_medida', '{}', 1],
  ['(b2) rajada "aro 16" + "195/55"', [U('boa tarde'), U('aro 16'), U('195/55')], 'sem_estado', '{}', null],
  ['(a3) "195/55" -> robo pede aro -> "aro 16 em 10x quanto fica?"', [U('195/55'), A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.'), U('aro 16 em 10x quanto fica?')], 'aguardando_medida', '{}', 1],
  ['(c) "195/55" sozinho (primeira mensagem)', [U('195/55')], 'sem_estado', '{}', null],
  ['(c2) "195/55" depois da pergunta generica', [U(ANUNCIO_PADRAO), A(SAUD), A(PERGUNTA), U('195/55')], 'aguardando_medida', '{}', 1],
  ['(c3) "195/55" + "quanto custa?"', [U('195/55'), U('quanto custa?')], 'sem_estado', '{}', null],
  ['(d) "195/55/16"', [U('195/55/16')], 'sem_estado', '{}', null],
  ['(d2) "195 55 r16"', [U('195 55 r16')], 'sem_estado', '{}', null],
  ['(d3) "aro 16 205/55"', [U('aro 16 205/55')], 'sem_estado', '{}', null],
  ['(e) so o carro "Pegeuot 208"', [U(ANUNCIO_PADRAO), A(SAUD), A(PERGUNTA), U('Pegeuot 208')], 'aguardando_medida', '{}', 1],
  ['(e2) so o carro "tenho um gol g5 2012"', [U('tenho um gol g5 2012')], 'sem_estado', '{}', null],
  ['(e3) "aro 16" sozinho (sem pedaco antes) -> pergunta o carro', [U(ANUNCIO_PADRAO), A(SAUD), A(PERGUNTA), U('aro 16')], 'aguardando_medida', '{}', 1],
  ['(f) "195/55" de ONTEM (loja falou ha 20h) + hoje "aro 16"', [U('195/55'), A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.'), U('aro 16')], 'aguardando_medida', '{}', 1200],
  ['(f2) "195/55" antes de um preco ja dado (outro orcamento) + "aro 16"', [U('195/55'), A('Show, 195/55! 👍'), U('185/65/15'), A('Temos o pneu *185/65/15* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.'), U('aro 16')], 'preco_confirmado', '{"medida":"185/65/15"}', 3],
  ['(f3) "195/55" la atras (mais de 8 mensagens) + "aro 16"', [U('195/55'), A('a'), U('b'), A('c'), U('d'), A('e'), U('f'), A('g'), U('h'), A('i'), U('aro 16')], 'sem_estado', '{}', 2],
];
(async () => {
  const filtro = process.argv[2];
  for (const [nome, messages, estadoPreco, dadosPreco, minutos] of casos) {
    if (filtro && !nome.includes(filtro)) continue;
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').slice(-15).map((m) => m.content).join('\n'), estadoPreco, dadosPreco, textosFluxo: {}, lojaBot, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: minutos, audioFluxo: true, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# ${nome}\n  via=${r.via} acao=${r.acaoTipo} assuntos=${JSON.stringify(r.assuntos)} chaves=${JSON.stringify(r.chaves)} estado=${r.novoEstadoPreco} dados=${r.novosDadosPreco}\n  > ${(r.partes || []).join('\n  > ')}${r.erro || r.error ? ' ERRO ' + (r.erro || r.error) : ''}`);
  }
})();
