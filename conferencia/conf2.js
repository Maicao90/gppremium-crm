// CONFERENTE 22/10 — casos novos depois das correcoes do conferente. SO lab (3011), simular:false.
const URL = 'http://127.0.0.1:3011/gerar-resposta';
const GP = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const PEDE_ARO = [A('Show, 195/55! 👍'), A('Qual é o aro? Na 195/55 eu tenho aro 15 e aro 16.')];
const AD13 = '📢 [Anúncio] 🚗 Pneu ARO 13 a partir de R$ 239,90 — Montagem Grátis!\n\nOi, Tudo bem ?';
const casos = [
  ['q1', 'pediu aro -> "13" (loja nao tem) -> vai pra atendente', [U('195/55'), ...PEDE_ARO, U('13')], 'aguardando_medida', '{}', 1],
  ['q2', 'rajada "185/65/15" + "195/55" + "aro 16" -> cota as duas', [U('185/65/15'), U('195/55'), U('aro 16')], 'sem_estado', '{}', null],
  ['q3', '"o aro 13 é esse preço?" respondido sem preco -> "e o 195/55?"', [U(AD13), U('o aro 13 é esse preço mesmo?'), A('É sim! Pneu aro 13 a partir daquele valor.'), U('e o 195/55?')], 'sem_estado', '{}', 1],
  ['q4', 'pediu aro -> "17" (loja nao tem 195/55/17)', [U('195/55'), ...PEDE_ARO, U('17')], 'aguardando_medida', '{}', 1],
  ['q5', '"195/55" + audio que nao transcreveu', [U('195/55'), U('[audio enviado]')], 'sem_estado', '{}', null],
  ['q6', 'audio transcrito por extenso + "aro dezesseis"', [U('cento e noventa e cinco cinquenta e cinco'), U('aro dezesseis')], 'sem_estado', '{}', null],
  ['q7', '"tenho aro 15 mas quero aro 16" + "195/55"', [U('tenho aro 15 mas quero aro 16'), U('195/55')], 'sem_estado', '{}', null],
  ['q8', 'pediu aro -> "aro 16, 2 pneus"', [U('195/55'), ...PEDE_ARO, U('aro 16, 2 pneus')], 'aguardando_medida', '{}', 1],
];
(async () => {
  const vezes = Number(process.argv[2] || 2);
  for (const [id, nome, messages, estadoPreco, dadosPreco, minutos] of casos) {
    for (let k = 1; k <= vezes; k++) {
      const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').slice(-15).map((m) => String(m.content ?? '')).join('\n'), estadoPreco, dadosPreco, textosFluxo: {}, lojaBot: GP, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: minutos, audioFluxo: true, simular: false, teste: true };
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => { const t = await x.text(); try { return { http: x.status, ...JSON.parse(t) }; } catch { return { http: x.status, erro: t.slice(0, 200) }; } }).catch((e) => ({ erro: e.message }));
      console.log(`\n# [${id}#${k}] ${nome}\n  http=${r.http} via=${r.via} acao=${r.acaoTipo} chaves=${JSON.stringify(r.chaves)} estado=${r.novoEstadoPreco} dados=${r.novosDadosPreco}\n  > ${(r.partes || []).map((p) => String(p).replace(/\n/g, ' / ')).join('\n  > ')}${r.erro || r.error ? '\n  ERRO ' + (r.erro || r.error) : ''}`);
    }
  }
})();
