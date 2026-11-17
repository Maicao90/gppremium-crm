// CONFERENTE 22/10 — testes extras da medida em pedacos. SO no lab (porta 3011). simular:false = IA de verdade.
const URL = 'http://127.0.0.1:3011/gerar-resposta';
if (!URL.includes(':3011/')) throw new Error('so lab');
const GP = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const CITY = { nome: 'City Pneus & Auto Center', telefone: '(61) 3774-2112', horario: '', localizacao: 'City Pneus & Auto Center', localizacaoTexto: 'na Avenida Marechal Teodoro, nas Chácaras Saia Velha, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const AD13 = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nOi, Tudo bem ?';
const AD13P = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nOlá! Tenho interesse e queria mais informações, por favor.';
const AD185 = '📢 [Anúncio] A Partir de R$ 189,00\n\nOlá! Quero aproveitar a oferta do 185/65/ R15 por R$ 199';
const PERG = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const SAUD = 'Oi, tudo bem? 😊';
const PEDE_ARO = [A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.')];
const P195_16 = A('Temos o pneu *195/55/16* da marca *GP Premium* está saindo por *R$ 259,00 à vista*.');
// [id, nome, messages, estado, dados, minutos, loja]
const casos = [
  ['g1', 'anuncio ARO 13 (frase padrao) + "195/55" -> pede aro (nao 195/55/13)', [U(AD13P), U('195/55')], 'sem_estado', '{}', null],
  ['g2', 'anuncio ARO 13 "Oi tudo bem" -> robo -> "195/55"', [U(AD13), A(SAUD), A(PERG), U('195/55')], 'aguardando_medida', '{}', 1],
  ['g3', 'anuncio 185/65/R15 prefixado + "195/55"', [U(AD185), U('195/55')], 'sem_estado', '{}', null],
  ['h1', '"195/55" -> pede aro -> "4 pneus aro 16" (qtd 4, nao 16)', [U('195/55'), ...PEDE_ARO, U('4 pneus aro 16')], 'aguardando_medida', '{}', 1],
  ['h2', '"195/55" -> pede aro -> "16" (sem a palavra aro)', [U('195/55'), ...PEDE_ARO, U('16')], 'aguardando_medida', '{}', 1],
  ['h3', '"195/55" + "15" rajada', [U('195/55'), U('15')], 'sem_estado', '{}', null],
  ['i1', 'CEP "72855-000" + "aro 16"', [U('meu cep e 72855-000'), U('aro 16')], 'sem_estado', '{}', null],
  ['i2', 'preco "vi por 195,50 na outra loja" + "aro 15"', [U('vi por 195,50 na outra loja'), U('aro 15')], 'sem_estado', '{}', null],
  ['i3', 'carro "peugeot 208 2016" + "aro 16"', [U('peugeot 208 2016'), U('aro 16')], 'sem_estado', '{}', null],
  ['i4', 'telefone "liga 61 99195-5512" + "aro 15"', [U('liga 61 99195-5512'), U('aro 15')], 'sem_estado', '{}', null],
  ['i5', '"gol 2015" -> robo -> "195/55"', [U('gol 2015'), A('Show! Qual a medida?'), U('195/55')], 'aguardando_medida', '{}', 1],
  ['j1', '"195 55 16"', [U('195 55 16')], 'sem_estado', '{}', null],
  ['j2', '"195-55-16"', [U('195-55-16')], 'sem_estado', '{}', null],
  ['j3', '"195/55r16"', [U('195/55r16')], 'sem_estado', '{}', null],
  ['j4', '"19555r16"', [U('19555r16')], 'sem_estado', '{}', null],
  ['j5', '"195 55" + "r16"', [U('195 55'), U('r16')], 'sem_estado', '{}', null],
  ['j6', '"195-55" -> pede aro -> "16"', [U('195-55'), ...PEDE_ARO, U('16')], 'aguardando_medida', '{}', 1],
  ['k1', 'fora da tabela "195/55" + "aro 13"', [U('195/55'), U('aro 13')], 'sem_estado', '{}', null],
  ['k2', 'cliente cita o anuncio "o aro 13 e esse preco?" + "e o 195/55?"', [U(AD13), A(SAUD), A(PERG), U('o aro 13 é esse preço mesmo?'), U('e o 195/55?')], 'aguardando_medida', '{}', 1],
  ['l1', 'troca: "195/55" -> pede aro -> "na verdade 205/55"', [U('195/55'), ...PEDE_ARO, U('na verdade é 205/55')], 'aguardando_medida', '{}', 1],
  ['l2', 'troca: 195/55/16 cotado -> "e o 205/55?"', [U('195/55'), ...PEDE_ARO, U('16'), P195_16, U('e o 205/55?')], 'preco_confirmado', '{"medida":"195/55/16"}', 1],
  ['l3', 'troca: 195/55/16 cotado -> "e aro 15?"', [U('195/55 aro 16'), P195_16, U('e aro 15?')], 'preco_confirmado', '{"medida":"195/55/16"}', 1],
  ['l4', 'troca: "aro 16" -> carro -> "195/55" -> "nao, 205/55"', [U('aro 16'), A('Show, aro 16! 👍'), A('Qual é o carro? Já te passo a medida certa e o valor.'), U('195/55'), U('não, 205/55')], 'aguardando_medida', '{}', 1],
  ['m1', 'remold: "195/55" -> pede aro -> "aro 16, é remold?"', [U('195/55'), ...PEDE_ARO, U('aro 16, é remold?')], 'aguardando_medida', '{}', 1],
  ['m2', 'desconto: "195/55" -> pede aro -> "aro 16 tem desconto no pix?"', [U('195/55'), ...PEDE_ARO, U('aro 16 tem desconto no pix?')], 'aguardando_medida', '{}', 1],
  ['m3', 'localizacao: "195/55" -> pede aro -> "aro 16" + "onde fica a loja?"', [U('195/55'), ...PEDE_ARO, U('aro 16'), U('onde fica a loja?')], 'aguardando_medida', '{}', 1],
  ['m4', 'visita: "195/55" -> pede aro -> "aro 16" + "passo ai amanha"', [U('195/55'), ...PEDE_ARO, U('aro 16'), U('passo aí amanhã de manhã')], 'aguardando_medida', '{}', 1],
  ['m5', 'horario: "aro 16" + "195/55" + "vcs abrem sabado?"', [U('aro 16'), U('195/55'), U('vcs abrem sábado?')], 'sem_estado', '{}', null],
  ['m6', 'disponibilidade: "195/55" -> pede aro -> "aro 16" + "tem a pronta entrega?"', [U('195/55'), ...PEDE_ARO, U('aro 16'), U('tem a pronta entrega?')], 'aguardando_medida', '{}', 1],
  ['m7', 'saudacao: "boa tarde" + "195/55" + "aro 16"', [U('boa tarde'), U('195/55'), U('aro 16')], 'sem_estado', '{}', null],
  ['m8', 'parcelamento: "195/55" + "aro 16" + "parcela?"', [U('195/55'), U('aro 16'), U('parcela?')], 'sem_estado', '{}', null],
  ['m9', 'balanceamento: "195/55" -> pede aro -> "aro 16" + "faz balanceamento?"', [U('195/55'), ...PEDE_ARO, U('aro 16'), U('faz balanceamento?')], 'aguardando_medida', '{}', 1],
  ['n1', 'CITY: "195/55" + "aro 16"', [U('195/55'), U('aro 16')], 'sem_estado', '{}', null, CITY],
  ['n2', 'CITY: "195/55" sozinho', [U('195/55')], 'sem_estado', '{}', null, CITY],
  ['o1', 'null/objeto no historico + "195/55" + "aro 16"', [U(null), A(null), { role: 'user' }, U({ x: 1 }), U(195), U('195/55'), U('aro 16')], 'sem_estado', '{}', null],
  ['o2', 'foto placeholder + "195/55"', [U('[imagem enviada]'), U('195/55')], 'sem_estado', '{}', null],
  ['o3', '"195/55" + audio sem texto', [U('195/55'), U('[audio enviado]')], 'sem_estado', '{}', null],
  ['o4', 'dadosPreco invalido + "195/55"', [U('195/55')], 'sem_estado', 'xx{', null],
  ['p1', 'regressao: "quanto custa?" sozinho', [U('quanto custa?')], 'sem_estado', '{}', null],
  ['p2', 'regressao: "195/55/15" cotado -> "é remold?"', [U('195/55/15'), A('Temos o pneu *195/55/15* da marca *GP Premium* está saindo por *R$ 289,00 à vista*.'), U('é remold?')], 'preco_confirmado', '{"medida":"195/55/15"}', 1],
  ['p3', 'regressao: "185/65/15 em 10x"', [U('185/65/15 em 10x quanto fica?')], 'sem_estado', '{}', null],
  ['p4', 'regressao: "bom dia"', [U('bom dia')], 'sem_estado', '{}', null],
  ['p5', 'regressao: preco dado -> "tem desconto a vista?"', [U('175/70/13'), A('Temos o pneu *175/70/13* da marca *GP Premium* está saindo por *R$ 239,90 à vista*.'), U('tem desconto a vista?')], 'preco_confirmado', '{"medida":"175/70/13"}', 1],
];
(async () => {
  const filtro = process.argv[2] ? process.argv[2].split(',') : null;
  const vezes = Number(process.argv[3] || 1);
  for (const [id, nome, messages, estadoPreco, dadosPreco, minutos, loja] of casos) {
    if (filtro && !filtro.some((f) => id.startsWith(f))) continue;
    for (let k = 1; k <= vezes; k++) {
      const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').slice(-15).map((m) => String(m.content ?? '')).join('\n'), estadoPreco, dadosPreco, textosFluxo: {}, lojaBot: loja || GP, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: minutos, audioFluxo: true, simular: false, teste: true };
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => { const t = await x.text(); try { return { http: x.status, ...JSON.parse(t) }; } catch { return { http: x.status, erro: t.slice(0, 200) }; } }).catch((e) => ({ erro: e.message }));
      console.log(`\n# [${id}#${k}] ${nome}\n  http=${r.http} via=${r.via} acao=${r.acaoTipo} chaves=${JSON.stringify(r.chaves)} estado=${r.novoEstadoPreco} dados=${r.novosDadosPreco}\n  > ${(r.partes || []).map((p) => String(p).replace(/\n/g, ' / ')).join('\n  > ')}${r.erro || r.error ? '\n  ERRO ' + (r.erro || r.error) : ''}`);
    }
  }
})();
