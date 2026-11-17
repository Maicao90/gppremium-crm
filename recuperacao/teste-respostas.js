// 22/10: como o robo responde quando o cliente responde a mensagem de recuperacao (so gera, teste:true)
const { execSync } = require('child_process');
const URL = 'http://127.0.0.1:3010/gerar-resposta';
const lojaBot = { nome: 'Pneus GP Premium', telefone: '', horario: '', localizacao: 'Pneus GP Premium', localizacaoTexto: '' };
const linhas = execSync(`docker exec gp-postgres-crm psql -U postgres -d testdb -tAc "select chave||'|'||partes from \\"FluxoResposta\\" where chave like 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:%'"`).toString().trim().split('\n');
const textosFluxo = {};
for (const l of linhas) { const i = l.indexOf('|'); textosFluxo[l.slice(0, i).split(':').pop()] = JSON.parse(l.slice(i + 1)); }
const U = (c) => ({ role: 'user', content: c });
const A = (c) => ({ role: 'assistant', content: c });
const COM = A('Oi, tudo bem? 😊 Aqui é da GP Premium! Você chegou a ver com a gente os pneus 185/65/15. Ainda está precisando? Se quiser, te passo o valor atualizado e dá pra parcelar em até 10x no cartão.');
const SEM = A('Oi, tudo bem? 😊 Aqui é da GP Premium! Você falou com a gente sobre pneus. Ainda está precisando? Me passa a medida ou o modelo do carro que eu te mando o valor atualizado.');
const ANTES = [U('quanto ta o 185/65/15?'), A('Temos o pneu *185/65/15* da marca *GP Premium* está saindo por *R$ 279,00 à vista*.')];
const casos = [
  ['com medida -> "sim"', [...ANTES, COM, U('sim')]],
  ['com medida -> "quero sim, qual o valor?"', [...ANTES, COM, U('quero sim, qual o valor?')]],
  ['com medida -> "preciso de 4"', [...ANTES, COM, U('preciso de 4')]],
  ['com medida -> "ja comprei"', [...ANTES, COM, U('já comprei, obrigado')]],
  ['com medida -> "nao preciso mais"', [...ANTES, COM, U('não preciso mais não')]],
  ['sem medida -> "sim"', [U('oi'), A('Oiê, tudo bem? 😊'), SEM, U('sim')]],
  ['sem medida -> "gol g5"', [U('oi'), SEM, U('gol g5 2012')]],
  ['sem medida -> "175/70/13"', [U('oi'), SEM, U('175/70/13')]],
  ['com medida -> "vou passar ai amanha"', [...ANTES, COM, U('vou passar aí amanhã')]],
];
(async () => {
  for (const [nome, messages] of casos) {
    const body = { messages, lojas: [], ultimosTextosCliente: messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'), estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo, lojaBot, minutosDesdeLocalizacao: null, minutosDesdeUltimaDaLoja: 5, audioFluxo: true, simular: false, teste: true };
    const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ erro: e.message }));
    console.log(`\n# ${nome}\n  via=${r.via} chaves=${JSON.stringify(r.chaves)}\n  > ${(r.partes || []).join('\n  > ')}${r.erro || r.error ? ' ERRO ' + (r.erro || r.error) : ''}`);
  }
})();
