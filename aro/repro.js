// Repete no bot-service do LABORATORIO (3011) as rodadas reais do cliente 556198132318 (22/10 11:42-11:44),
// com o payload que o worker monta (messages = historico do banco, estado/dados salvos, minutos desde a loja).
// simular:false = passa pela IA de verdade (extrator + IA livre). teste:true = cerebro nao registra uso.
const URL = 'http://127.0.0.1:3011/gerar-resposta';
const lojaBot = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const ANUNCIO = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nQual o valor do aro 16';
const PERGUNTA = 'Poderia me informar a medida do pneu (ex.: 175/65/14) ou o modelo do seu carro?';
const rodadas = [
  ['11:42:44 anuncio "Qual o valor do aro 16" + "195/55"', [U(ANUNCIO), U('195/55')], 'sem_estado', '{}', null],
  ['11:43:28 "Aro 16" (o "195/55" chegou 1s depois)', [U(ANUNCIO), U('195/55'), A(PERGUNTA), U('Aro 16')], 'aguardando_medida', '{}', 1],
  ['se a rodada tivesse visto "Aro 16" + "195/55"', [U(ANUNCIO), U('195/55'), A(PERGUNTA), U('Aro 16'), U('195/55')], 'aguardando_medida', '{}', 1],
  ['11:44:14 "Pegeuot 208"', [U(ANUNCIO), U('195/55'), A(PERGUNTA), U('Aro 16'), U('195/55'), A('Show, aro 16! 👍'), A('Qual é o carro? Já te passo a medida certa e o valor.')].concat([U('Pegeuot 208')]), 'aguardando_medida', '{}', 1],
];
(async () => {
  for (const [nome, messages, estadoPreco, dadosPreco, minutos] of rodadas) {
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').slice(-15).map((m) => m.content).join('\n'), estadoPreco, dadosPreco, textosFluxo: {}, lojaBot, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: minutos, audioFluxo: true, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# ${nome}\n  via=${r.via} acao=${r.acaoTipo} assuntos=${JSON.stringify(r.assuntos)} chaves=${JSON.stringify(r.chaves)} estado=${r.novoEstadoPreco} dados=${r.novosDadosPreco}\n  > ${(r.partes || []).join('\n  > ')}${r.erro || r.error ? ' ERRO ' + (r.erro || r.error) : ''}`);
  }
})();
