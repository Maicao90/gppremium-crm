// Repete no bot-service do laboratorio (porta 3011) os casos reais que deram errado em 21-22/10.
const URL = 'http://127.0.0.1:3011/gerar-resposta';
const PERGUNTA = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const casos = [
  ['"14" depois da pergunta (era 14 pneus 175/65/14)', [{ role: 'assistant', content: 'Oi, tudo bem?' }, { role: 'assistant', content: PERGUNTA }, { role: 'user', content: '14' }], {}],
  ['Roberto: audio pedindo 195/55/15 (era 175/65/14)', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Quero saber o valor do pneu 195 55 aro 15' }], {}],
  ['"aro 15?" + "185/60" (saia 175/65/14 antes)', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Qual o preço do aro 15?' }, { role: 'user', content: '185/60' }], {}],
  ['"trocar dois pneus aro 18 em aro 16" (era 2x 175/65/14)', [{ role: 'assistant', content: PERGUNTA }, { role: 'user', content: 'Queria trocar dois pneus aro 18 em aro 16' }], {}],
  ['anuncio Brutus + 265/60r18', [{ role: 'user', content: '📢 [Anúncio] Pneus Brutus em Oferta\n\nOlá! Tenho interesse e queria mais informações, por favor.' }, { role: 'assistant', content: PERGUNTA }, { role: 'user', content: '265/60r18' }], {}],
  ['"O Brutus" e depois "Os 4" (era R$2.236 do H/T)', [{ role: 'assistant', content: 'Temos o pneu *265/60/18* da marca *GP Premium* está saindo por *R$ 559,00 à vista*.' }, { role: 'user', content: 'O Brutus' }, { role: 'assistant', content: 'Perfeito!' }, { role: 'user', content: 'Os 4' }], { estadoPreco: 'preco_confirmado', dadosPreco: JSON.stringify({ medida: '265/60/18' }) }],
  ['4 pneus 195/55/15 em 10x (estava certo)', [{ role: 'user', content: 'Quatro pneus 195/55/15 dividido em 10 qual valor sairia' }], {}],
];
(async () => {
  for (const [nome, messages, extra] of casos) {
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, audioFluxo: true, simular: true, ...extra }) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# ${nome}\n  via=${r.via} chaves=${JSON.stringify(r.chaves)}\n  ${(r.partes || []).join('\n  ')}${r.erro ? ' ERRO ' + r.erro : ''}`);
  }
})();
