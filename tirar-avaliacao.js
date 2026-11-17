// 23/10 (dono): pedir avaliacao no Google fica com a Josy — tira o ensinamento e marca a proposta como ignorada.
const fs = require('fs');
const B = '/root/whatsapp-crm/backend/data/cerebro';
const grava = (arq, obj) => { const t = `${arq}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(obj, null, 1)); fs.renameSync(t, arq); };
const l = JSON.parse(fs.readFileSync(`${B}/licoes.json`, 'utf8'));
const fica = l.filter((x) => x.propostaJosy !== 'pos_venda_avaliacao' && !/avalia[cç][aã]o pra gente no Google/.test(x.resposta));
console.log('ensinamentos:', l.length, '->', fica.length);
grava(`${B}/licoes.json`, fica);
const d = JSON.parse(fs.readFileSync(`${B}/aprendizado-josy.json`, 'utf8'));
const p = d.propostas.find((x) => x.id === 'pos_venda_avaliacao');
Object.assign(p, { status: 'ignorado', decididoEm: new Date().toISOString(), decididoPor: 'Dono (23/10)', nota: 'Pedir avaliação no Google fica com a Josy (ela sabe a hora certa).' });
grava(`${B}/aprendizado-josy.json`, d);
console.log('proposta:', p.status);
