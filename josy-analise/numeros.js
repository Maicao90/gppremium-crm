// numeros gerais da leitura das conversas
const fs = require('fs');
const rs = fs.readFileSync('/root/josy-analise/resultados.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const conta = (f) => Object.entries(rs.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
const vendas = rs.filter((r) => r.e_atendimento_de_venda);
console.log('total', rs.length, 'de venda', vendas.length);
console.log('resultado', JSON.stringify(conta((r) => r.resultado)));
console.log('origem', JSON.stringify(conta((r) => r.origem)));
console.log('vale recuperar', rs.filter((r) => r.recuperacao && r.recuperacao.vale_recuperar).length);
// motivos de perda mais comuns (palavras-chave)
const motivos = vendas.map((r) => (r.motivo_perda || '').toLowerCase()).filter(Boolean);
const chaves = { 'preço/caro': /caro|pre[cç]o|valor|barato/, 'outra loja/orçamento': /outr[ao] (loja|or[cç]amento|lugar)|concorr|compar/, 'remold/qualidade': /remold|qualidade|novo/, 'não respondeu/demora': /n[aã]o respond|demor|sem resposta|ignor/, 'sem a medida/fora da tabela': /medida|n[aã]o tinha|falta|estoque/, 'distância/localização': /dist[aâ]ncia|longe|cidade|entrega/ };
for (const [k, re] of Object.entries(chaves)) console.log('motivo', k, motivos.filter((m) => re.test(m)).length);
// robo x loja: resultado quando o robo respondeu algo
const comRobo = vendas.filter((r) => (r.momentos || []).some((m) => m.quem_respondeu === 'robo'));
console.log('conversas com robo', comRobo.length, JSON.stringify(conta.call(null, (r) => r.resultado).length));
const taxa = (lista) => (lista.filter((r) => r.resultado === 'fechou_ou_agendou' || r.resultado === 'foi_na_loja_sem_confirmar').length / Math.max(1, lista.length) * 100).toFixed(1) + '%';
console.log('fechou/agendou: geral', taxa(vendas), '| com robo', taxa(comRobo), '| so loja', taxa(vendas.filter((r) => !comRobo.includes(r))));
