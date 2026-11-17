// 23/10: "vou passar aí amanhã" caia no ensinamento do "vou pensar" (passava por cima do fluxo que agenda a visita).
// A situacao do ensinamento passa a excluir quem diz que vem na loja.
const fs = require('fs');
const ARQ = '/root/whatsapp-crm/backend/data/cerebro/licoes.json';
const l = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
const x = l.find((i) => i.propostaJosy === 'vai_pensar' || /vai pensar/.test(i.situacao));
x.situacao = 'quando o cliente diz que vai pensar, pesquisar, ver com alguém ou decidir depois — NÃO vale quando ele diz que vem ou passa na loja (com ou sem dia)';
x.atualizadoEm = new Date().toISOString();
const tmp = ARQ + '.tmp-' + process.pid;
fs.writeFileSync(tmp, JSON.stringify(l, null, 1));
fs.renameSync(tmp, ARQ);
console.log('ok:', x.id, x.situacao);
