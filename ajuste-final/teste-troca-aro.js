// Ajuste 2 (23/10): "aro 16" / "e aro 16?" depois do preco de OUTRA medida. SO no lab (porta 3011).
// 3011 = lab com os ajustes; 3012 = copia do lab com o codigo de producao (pra comparar). NUNCA 3010.
const PORTA = String(process.env.LAB_PORT || '3011');
if (!['3011', '3012'].includes(PORTA)) throw new Error('so lab');
const URL = `http://127.0.0.1:${PORTA}/gerar-resposta`;
const GP = { nome: 'Pneus GP Premium', telefone: '(61) 3601-2020', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };
const U = (content) => ({ role: 'user', content });
const A = (content) => ({ role: 'assistant', content });
const P = (m, v) => A(`Temos o pneu *${m}* da marca *GP Premium* está saindo por *R$ ${v} à vista*.`);
const PARC = A('Se preferir, você pode parcelar em até 10x no cartão!');
// Precos iguais aos da tabela (23/10), pra IA nao "corrigir" valor de teste.
const C185 = [U('185/65/15'), P('185/65/15', '249,00'), PARC];
const C195 = [U('195/55/15'), P('195/55/15', '289,00'), PARC];
const casos = [
  ['t1', '185/65/15 cotado -> "aro 16" (185/65/16 nao existe: pede a medida com a lista)', [...C185, U('aro 16')], 'preco_confirmado', '{"medida":"185/65/15"}', 1],
  ['t2', '185/65/15 cotado -> "e aro 16?"', [...C185, U('e aro 16?')], 'preco_confirmado', '{"medida":"185/65/15"}', 1],
  ['t3', '195/55/15 cotado -> "aro 16" (195/55/16 existe: cota)', [...C195, U('aro 16')], 'preco_confirmado', '{"medida":"195/55/15"}', 1],
  ['t4', '195/55/15 cotado -> "e aro 16?"', [...C195, U('e aro 16?')], 'preco_confirmado', '{"medida":"195/55/15"}', 1],
  ['t5', '205/60/15 cotado -> "tem aro 16?" (205/60/16 existe)', [U('205/60/15'), P('205/60/15', '289,00'), U('tem aro 16?')], 'preco_confirmado', '{"medida":"205/60/15"}', 1],
  ['t6', '175/70/13 cotado (4 pneus) -> "e no aro 14?" (175/70/14 existe, mantem quantidade)', [U('4 pneus 175/70/13'), P('175/70/13', '269,00'), U('e no aro 14?')], 'preco_confirmado', '{"medida":"175/70/13","quantidade":4}', 1],
  ['t7', 'cliente antigo sem estado: preco 185/65/15 no historico -> "e aro 16?"', [...C185, U('e aro 16?')], 'sem_estado', '{}', 30],
  ['t8', '185/65/15 cotado -> "aro 19" (nenhuma medida aro 19)', [...C185, U('aro 19')], 'preco_confirmado', '{"medida":"185/65/15"}', 1],
  ['t9', 'mesmo aro: 185/65/15 cotado -> "aro 15?" (nao muda nada)', [...C185, U('aro 15?')], 'preco_confirmado', '{"medida":"185/65/15"}', 1],
  ['t10', 'sem preco antes: "aro 16" sozinho (continua "Show, aro 16!")', [U('aro 16')], 'sem_estado', '{}', null],
];
(async () => {
  const filtro = process.argv[2] ? process.argv[2].split(',') : null;
  const vezes = Number(process.argv[3] || 2);
  for (const [id, nome, messages, estadoPreco, dadosPreco, minutos] of casos) {
    if (filtro && !filtro.includes(id)) continue;
    for (let k = 1; k <= vezes; k++) {
      const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').slice(-15).map((m) => String(m.content ?? '')).join('\n'), estadoPreco, dadosPreco, textosFluxo: {}, lojaBot: GP, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: minutos, audioFluxo: true, simular: false, teste: true };
      const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (x) => { const t = await x.text(); try { return { http: x.status, ...JSON.parse(t) }; } catch { return { http: x.status, erro: t.slice(0, 200) }; } }).catch((e) => ({ erro: e.message }));
      console.log(`\n# [${id}#${k}] ${nome}\n  http=${r.http} via=${r.via} acao=${r.acaoTipo} chaves=${JSON.stringify(r.chaves)} estado=${r.novoEstadoPreco} dados=${r.novosDadosPreco}\n  > ${(r.partes || []).map((p) => String(p).replace(/\n/g, ' / ')).join('\n  > ')}${r.erro || r.error ? '\n  ERRO ' + (r.erro || r.error) : ''}`);
    }
  }
})();
