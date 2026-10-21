const src = require('fs').readFileSync(process.argv[2], 'utf8');
const m = /const REGEX_CANDIDATO = (\/.*\/i);/.exec(src);
const re = eval(m[1]);
const sim = ['Olá, bom dia!! Tudo bem ?! Me chamo Wellyngton   Me interesso em um dia fazer parte de sua empresa, gosto de desafios', 'Boa tarde! Tudo bem?  Me chamo Bruna e possuo interesse na vaga de Auxiliar financeiro.', 'Posso enviar o currículo de mecânico', 'Opa boa tarde vcs tão contratando?', 'Estão contratando?', 'Boa tarde, eu posso te encaminhar meu currículo então?', 'Vcs está contratando pra trabalhar', 'tem vaga de emprego?', 'segue meu curriculo'];
const nao = ['No sábado tem vaga?', 'Tem como explicar sobre a vaga?', 'Chama e garanta sua vaga levamos e buscamos sua encomenda', 'Vou de vagar pq vou levando uma carretinha carregada', 'Você tem que falar mais devagar.por favor', 'quanto ta o 175/70/14?', 'Deixa minha vaga', 'tem vaga pra montar hoje?'];
let erros = 0;
for (const t of sim) if (!re.test(t)) { erros++; console.log('DEVIA PEGAR:', t); }
for (const t of nao) if (re.test(t)) { erros++; console.log('NAO DEVIA PEGAR:', t); }
console.log(erros ? `${erros} ERRO(S)` : `OK: ${sim.length} candidatos pegos, ${nao.length} clientes ignorados`);
