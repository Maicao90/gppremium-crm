// Ajuste 3: historico REAL do Marcelo Santos (556199788540) ate o "2010". SO no lab (3011), IA de verdade.
// 3011 = lab com os ajustes; 3012 = copia do lab com o codigo de producao (pra comparar). NUNCA 3010.
const PORTA = String(process.env.LAB_PORT || '3011');
if (!['3011', '3012'].includes(PORTA)) throw new Error('so lab');
const URL = `http://127.0.0.1:${PORTA}/gerar-resposta`;
const GP = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const messages = [
  U('Bom dia'),
  A('Oiê, tudo bem? 😊'),
  A('Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro que eu vejo pra você 😉'),
  U('Pneu aro 14 para VW Gol'),
  A('Pro Gol aro 14, temos o pneu *175/65/14* da marca *GP Premium* saindo por *R$ 249,00 à vista*.'),
  A('Se preferir, você pode parcelar em até 10x no cartão!'),
  A('Se o seu for de outra medida no aro 14, como o 175/70/14 dos Gol mais antigos, me avisa que eu te passo o valor dela.'),
  U('2010'),
];
(async () => {
  const vezes = Number(process.argv[2] || 2);
  for (let k = 1; k <= vezes; k++) {
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'), estadoPreco: 'aguardando_medida', dadosPreco: '{}', textosFluxo: {}, lojaBot: GP, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: 24, audioFluxo: true, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# [marcelo#${k}] "2010" depois do preco 175/65/14 + parcelamento\n  via=${r.via} motivoLivre=${r.motivoLivre} chaves=${JSON.stringify(r.chaves)}\n  > ${(r.partes || []).map((p) => String(p).replace(/\n/g, ' / ')).join('\n  > ')}${r.erro || r.error ? '\n  ERRO ' + (r.erro || r.error) : ''}`);
  }
})();
