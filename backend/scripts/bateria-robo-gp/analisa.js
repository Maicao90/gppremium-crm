// Le sim-resultado.jsonl e mede onde o robo do laboratorio foge do que foi ensinado. Uso: node analisa.js [amostras por grupo]
const fs = require('fs');
const AM = Number(process.argv[2] || 8);
const convs = fs.readFileSync('sim-resultado.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const pts = convs.flatMap((c) => c.p.map((p) => ({ ...p, c: c.c })));
const pct = (n) => `${n} (${(100 * n / Math.max(1, pts.length)).toFixed(1)}%)`;
const conta = (arr, f) => { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort((a, b) => b[1] - a[1]); };
const ATEND = /inexistente|sem_alternativa|outra_marca|assunto_atendente/;
const desfecho = (p) => p.erro ? 'ERRO tecnico'
  : (p.chaves || []).some((c) => ATEND.test(c)) || p.acao === 'PASSAR_ATENDENTE' ? 'passou pra atendente'
  : p.via === 'ia_livre' ? 'IA livre (improviso)'
  : !(p.partes || []).length ? 'silencio'
  : p.via === 'cerebro' ? 'ensinamento (texto fixo do dono)'
  : 'fluxo fixo';
console.log(`CONVERSAS: ${convs.length}   RESPOSTAS SIMULADAS: ${pts.length}\n`);
console.log('== DESFECHO');
for (const [k, n] of conta(pts, desfecho)) console.log(`  ${k.padEnd(34)} ${pct(n)}`);
console.log('\n== IA LIVRE por motivo');
for (const [k, n] of conta(pts.filter((p) => desfecho(p) === 'IA livre (improviso)'), (p) => p.mot || '-')) console.log(`  ${k.padEnd(24)} ${n}`);
console.log('\n== ATENDENTE por chave');
for (const [k, n] of conta(pts.filter((p) => desfecho(p) === 'passou pra atendente'), (p) => (p.chaves || []).filter((c) => ATEND.test(c) || c === 'cerebro').join('+') || p.acao)) console.log(`  ${k.padEnd(40)} ${n}`);
console.log('\n== SILENCIO por chave');
for (const [k, n] of conta(pts.filter((p) => desfecho(p) === 'silencio'), (p) => (p.chaves || []).join('+') || '-')) console.log(`  ${k.padEnd(40)} ${n}`);
console.log('\n== CHAVES MAIS USADAS (fluxo fixo)');
for (const [k, n] of conta(pts.filter((p) => desfecho(p) === 'fluxo fixo').flatMap((p) => p.chaves || []), (c) => c).slice(0, 25)) console.log(`  ${k.padEnd(28)} ${n}`);

const txt = (p) => (p.cliente || []).join(' / ');
const resp = (p) => (p.partes || []).join(' / ');
const MEDIDA = /(?<![\d$.,])(1[3-9]5|2\d5|3[0-3]5)\s*[\/xX.\- ]\s*([2-8][05])\s*[\/xX.\- ]?\s*[rR]?\s*(1[2-9]|2[0-2])(?!\d)/;
const violacoes = {
  'V1 erro tecnico': (p) => !!p.erro,
  'V2 cliente PERGUNTOU e o robo ficou em silencio': (p) => desfecho(p) === 'silencio' && /\?|\b(quanto|qual|valor|pre[cç]o|onde|tem)\b/i.test(txt(p)) && !(p.chaves || []).some((c) => /fornecedor|curriculo|resposta_automatica/.test(c)),
  'V3 pediu a medida com a medida escrita na mensagem': (p) => (p.chaves || []).some((c) => /^pedir_medida/.test(c)) && MEDIDA.test(txt(p)),
  'V4 repetiu bolha que a loja acabou de mandar': (p) => (p.partes || []).some((b) => b.length > 25 && (p.antes || []).some((a) => a.startsWith('L: ') && a.slice(3).startsWith(b.slice(0, 120)))),
  'V5 guarda de horario agiu (ia mandar vir com a loja fechada)': (p) => (p.chaves || []).includes('loja_fechada'),
  'V6 confirmou visita ("Combinado/Te esperamos")': (p) => /Combinado|Te esperamos|te espero/i.test(resp(p)),
  'V7 resposta de status aberto/fechado': (p) => (p.chaves || []).includes('status_aberto'),
  'V8 medida com erro de digitacao corrigida (nao foi pra atendente)': (p) => /(?<![\d$.,])(1[3-9]|2\d|3[0-3])[46]\s*[\/xX\-]\s*[2-8][05]/.test(txt(p)) && !(p.chaves || []).some((c) => ATEND.test(c)),
};
console.log('\n== CHECAGENS');
const hits = {};
for (const [nome, f] of Object.entries(violacoes)) { hits[nome] = pts.filter((p) => { try { return f(p); } catch { return false; } }); console.log(`  ${nome.padEnd(66)} ${hits[nome].length}`); }
const mostra = (titulo, lista) => {
  console.log(`\n---- ${titulo} (${lista.length}) ----`);
  const passo = Math.max(1, Math.floor(lista.length / AM));
  for (let i = 0; i < lista.length && i / passo < AM; i += passo) {
    const p = lista[i];
    console.log(`  • ${new Date(p.t * 1000 - 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')} CLIENTE: ${txt(p).slice(0, 230)}`);
    if ((p.antes || []).length) console.log(`      antes: ${p.antes.slice(-2).join(' | ').slice(0, 230)}`);
    console.log(`      LAB (${p.via}/${(p.chaves || []).join('+') || p.mot || '-'}): ${resp(p).slice(0, 260) || '(sem texto)'}`);
    if ((p.real || []).length) console.log(`      na vida real: ${p.real.join(' | ').slice(0, 230)}`);
  }
};
for (const nome of ['V2 cliente PERGUNTOU e o robo ficou em silencio', 'V3 pediu a medida com a medida escrita na mensagem', 'V4 repetiu bolha que a loja acabou de mandar', 'V5 guarda de horario agiu (ia mandar vir com a loja fechada)', 'V1 erro tecnico']) mostra(nome, hits[nome]);
mostra('IA LIVRE — assunto_sem_bloco', pts.filter((p) => desfecho(p) === 'IA livre (improviso)' && p.mot === 'assunto_sem_bloco'));
mostra('ATENDENTE — assunto/ensinamento (nao e medida que falta)', pts.filter((p) => desfecho(p) === 'passou pra atendente' && !(p.chaves || []).some((c) => /inexistente/.test(c))));
