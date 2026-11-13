// BATERIA DE REGRESSAO do robo GP — cada caso e um print REAL da Josy (12-13/11). Roda contra o bot-service com
// simular:true (nao envia nada). Uso: node /root/regressao-robo-gp.js  -> lista PASSOU/FALHOU. Rodar depois de toda mudanca.
const URL = 'http://127.0.0.1:3010/gerar-resposta';
const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content });
const PRECO175 = 'Temos o pneu *175/70/14* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.';
const GAR = 'Mas o GP Premium tem controle de qualidade rígido e garantia de 2 anos e 60 mil km ou seu dinheiro de volta.';
const casos = [
  { nome: '"Onde fica a loja?" + "?" manda a localizacao', msgs: [U('Quero 2'), U('Onde fica a loja ?'), A('Temos os 2 pneus *185/60/15* ... R$ 498,00'), A('Quando você consegue passar aqui na loja?'), U('?')], estado: 'preco_confirmado', dados: { medida: '185/60/15', quantidade: 2 },
    ok: (j) => (j.chaves || []).includes('localizacao') },
  { nome: 'resposta automatica de empresa = silencio', msgs: [A('Oi! Aqui é da GP Premium! Você chegou a ver os pneus 235/70/16?'), U('Infinity Visual agradece seu contato. Como posso ajudar ?')],
    ok: (j) => j.acaoTipo === 'SILENCIO' },
  { nome: '"Bom dia" nao vai pra atendente', msgs: [A('*Josy:* a minha creio que não gostem kkkkk'), U('Uai pq ?'), U('Bom dia')],
    ok: (j) => j.acaoTipo !== 'PASSAR_ATENDENTE' },
  { nome: 'foto + "qual valor / 04 pneus" le a foto (nao cota medida velha)', msgs: [A('Temos o pneu *195/65/15* ... R$ 329,00'), U('Qual valor'), U('04 pneus')], estado: 'preco_confirmado', dados: { medida: '195/65/15' }, imagem: { base64: 'AAAA', mime: 'image/jpeg' },
    ok: (j) => j.via === 'ia_livre' },
  { nome: '"Ok obrigado" depois da objecao: so agradece, sem garantia', msgs: [A(PRECO175), U('Atacadao dos pneus esta mais em conta'), A('Entendo! Se quiser, vem até a loja ver o pneu de perto.'), U('Ok obrigado')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => !(j.partes || []).join(' ').match(/garantia|or[çc]amento/i) },
  { nome: 'objecao com garantia ja dita: garantia nao repete', msgs: [A(PRECO175), A(GAR), U('Achei mais barato em outro lugar, os pneus de vocês são remold né')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => ((j.partes || []).join('\n').match(/garantia de 2 anos/gi) || []).length === 0 && ((j.partes || []).join('\n').match(/at[eé] a loja/gi) || []).length <= 1 },
  { nome: '"175/64 aro 14" cota 175/65/14 (erro de digitacao)', msgs: [U('Boa tarde'), U('Qual a marca do pneu 175/64 aro 14')],
    ok: (j) => (j.partes || []).join(' ').includes('175/65/14') },
  { nome: '235/70/16 = Brutus R$489 (sem ATR)', msgs: [U('valor do 235/70/16')], ok: (j) => /489/.test((j.partes || []).join(' ')) && !/ATR/.test((j.partes || []).join(' ')) },
  { nome: '265/65/17 tem ATR R$559', msgs: [U('valor do 265/65/17')], ok: (j) => /559/.test((j.partes || []).join(' ')) },
  { nome: '205/65/15 acabou -> atendente (nao diz que acabou)', msgs: [U('valor do 205/65/15')], ok: (j) => (j.chaves || []).includes('medida_inexistente') },
  { nome: '"ja e instalado?" depois do preco -> atendente', msgs: [A(PRECO175), U('Esse valor já é instalado?')], estado: 'preco_confirmado', dados: { medida: '175/70/14' }, ok: (j) => j.acaoTipo === 'PASSAR_ATENDENTE' },
  { nome: '"Celta 2012" depois de pedir a medida -> IA descobre a medida', msgs: [U('quero orçamento'), A('Qual a medida dos pneus que você precisa hoje? Se não souber, me fala qual é o seu carro'), U('Celta 2012')], estado: 'aguardando_medida', ok: (j) => j.via === 'ia_livre' },
  { nome: 'print do anuncio "eu vi essa propaganda": valores SAO a base de troca', msgs: [A('Temos o pneu *175/65/14* ... R$ 249,00'), U('Eu vi essa propaganda')], estado: 'preco_confirmado', dados: { medida: '175/65/14' }, imagem: { base64: 'AAAA', mime: 'image/jpeg' },
    ok: (j) => j.via === 'ia_livre' },
  { nome: '"voces fazem base de troca?" -> sim, nas 2 medidas do anuncio', msgs: [U('vocês fazem base de troca?')], ok: (j) => /base de troca/i.test((j.partes || []).join(' ')) && !/n[aã]o (trabalha|fazemos|aceita)/i.test((j.partes || []).join(' ')) },
  { nome: '185/65/15 cota normal + base de troca R$199', msgs: [U('valor do 185/65/15')], ok: (j) => /249/.test((j.partes || []).join(' ')) && /199/.test((j.partes || []).join(' ')) },
  { nome: '"no anuncio nao fala de base de troca" -> esta na descricao', msgs: [A('Os valores do anúncio são à base de troca: o *165/70/14* sai por *R$ 189,00* e o *185/65/15* por *R$ 199,00*, deixando o seu pneu usado aqui na troca 😉'), U('mas no anúncio não fala isso de base de troca')],
    ok: (j) => /descri[cç][aã]o do an[uú]ncio/i.test((j.partes || []).join(' ')) },
  { nome: '"Atendente ? / Nome ?" -> responde o nome (Josy)', msgs: [A('Quando você consegue passar aqui na loja pra gente fazer a troca?'), U('Atendente ?'), U('Nome ?')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => /Josy/.test((j.partes || []).join(' ')) && j.acaoTipo !== 'PASSAR_ATENDENTE' },
  { nome: '"Ta bom / voces abrem ai amanha" -> horario (nao "te esperamos")', msgs: [A('Temos o pneu *175/70/14* ... R$ 279,00'), U('Tá bom'), U('Boa tarde vocês abrem ai amanhã')], estado: 'preco_confirmado', dados: { medida: '175/70/14' },
    ok: (j) => j.acaoTipo === 'RESPONDER_HORARIO' && !/Combinado|esperamos/i.test((j.partes || []).join(' ')) },
];
(async () => {
  let falhas = 0;
  for (const c of casos) {
    let j = {};
    try {
      j = await (await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: c.msgs, estadoPreco: c.estado || 'sem_estado', dadosPreco: c.dados ? JSON.stringify(c.dados) : null, imagem: c.imagem, lojaBot: { nome: 'Pneus GP Premium' }, simular: true }) })).json();
    } catch (e) { j = { erro: String(e) }; }
    const passou = (() => { try { return !!c.ok(j); } catch { return false; } })();
    if (!passou) falhas++;
    console.log(`${passou ? 'PASSOU' : 'FALHOU'} | ${c.nome}${passou ? '' : `\n         acao=${j.acaoTipo} via=${j.via} chaves=${JSON.stringify(j.chaves)} partes=${(j.partes || []).join(' / ').slice(0, 220)}`}`);
  }
  console.log(`\n${casos.length - falhas}/${casos.length} passaram`);
  process.exitCode = falhas ? 1 : 0;
})();
