// 22/10 (dono: "aprovo, bota pra rodar"): agenda a retomada dos clientes da GP que receberam preco/mostraram interesse e
// sumiram, pelo MESMO sistema de agendamentos que a Josy usa (sai pelo numero da GP, cancela sozinho se o cliente responder).
// Seguranca do numero: poucos por dia, espacados, so em horario de loja, mais recentes primeiro.
// Uso: node montar-recuperacao.js           -> so mostra (nao grava nada)
//      node montar-recuperacao.js --gravar  -> cria os agendamentos
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const JOSY = '34268c16-7bed-400a-bf1e-a3d9e37d8774';
const POR_DIA = 40;
const JANELAS = [[9, 0, 11, 30], [14, 0, 17, 0]]; // horario de Brasilia
const GRAVAR = process.argv.includes('--gravar');
const sql = (q) => execSync(`docker exec -i gp-postgres-crm psql -U postgres -d testdb -tA -F '\t'`, { input: q, maxBuffer: 1 << 28 }).toString().trim().split('\n').filter(Boolean).map((l) => l.split('\t'));

// conversas da GP: ultimo numero real, ultimo horario, nome
const chats = new Map();
for (const [jid, numero, ultima, nome] of sql(`select "chatJid", (array_agg("numeroReal" order by timestamp desc) filter (where "numeroReal" is not null and "numeroReal"<>''))[1], max(timestamp), max("chatNome") from "Mensagem" where "usuarioId"='${JOSY}' group by "chatJid";`)) {
  chats.set(crypto.createHash('sha1').update(jid).digest('hex').slice(0, 10), { jid, numero: (numero || '').replace(/\D/g, ''), ultima: new Date(ultima + 'Z'), nome });
}
const pausados = new Set(sql(`select "chatJid" from "BotConversa" where "usuarioId"='${JOSY}' and "pausadoAte" > now();`).map((r) => r[0]));
const comAgendamento = new Set(sql(`select regexp_replace(numero,'\\D','','g') from "Agendamento" where status='pendente';`).map((r) => r[0]));
const naoAtenderArq = JSON.parse(fs.readFileSync('/root/whatsapp-crm/backend/data/bot-nao-atender.json', 'utf8'));
const naoAtender = new Set((naoAtenderArq.numeros || []).map((x) => String(x.numero || x).replace(/\D/g, '')));

const resultados = fs.readFileSync('/root/josy-analise/resultados.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const motivos = {};
const conta = (k) => { motivos[k] = (motivos[k] || 0) + 1; };
const MEDIDA = /^\d{3}\/\d{2}\s*(r|\/)?\s*\d{2}$/i;
const lista = [];
for (const r of resultados) {
  if (!r.recuperacao?.vale_recuperar) { conta('nao_vale'); continue; }
  if (!['sumiu_depois_do_preco', 'vai_pensar', 'sumiu_antes_do_preco', 'foi_na_loja_sem_confirmar'].includes(r.resultado)) { conta('resultado_' + r.resultado); continue; }
  const c = chats.get(r.id);
  if (!c) { conta('sem_conversa'); continue; }
  if (!/^55\d{10,11}$/.test(c.numero)) { conta('sem_numero_real'); continue; }
  if (naoAtender.has(c.numero)) { conta('nao_atender'); continue; }
  if (pausados.has(c.jid)) { conta('pausado_atendente'); continue; }
  if (comAgendamento.has(c.numero)) { conta('ja_tem_agendamento'); continue; }
  const dias = (Date.now() - c.ultima.getTime()) / 864e5;
  if (dias < 2) { conta('conversa_recente'); continue; }
  const medida = (r.cliente?.medidas || []).map((m) => m.replace(/\s*R\s*/i, '/').replace(/\s+/g, '')).find((m) => MEDIDA.test(m));
  const mensagem = medida
    ? `Oi, tudo bem? 😊 Aqui é da GP Premium! Você chegou a ver com a gente os pneus ${medida.replace(/^(\d{3}\/\d{2})\/?(\d{2})$/, '$1/$2')}. Ainda está precisando? Se quiser, te passo o valor atualizado e dá pra parcelar em até 10x no cartão.`
    : `Oi, tudo bem? 😊 Aqui é da GP Premium! Você falou com a gente sobre pneus${dias <= 14 ? ' esses dias' : ''}. Ainda está precisando? Me passa a medida ou o modelo do carro que eu te mando o valor atualizado.`;
  lista.push({ id: r.id, numero: c.numero, cliente: (c.nome || '').slice(0, 80), mensagem, ultima: c.ultima, dias: Math.round(dias) });
}
lista.sort((a, b) => b.ultima - a.ultima); // mais recentes primeiro

// horarios: comeca amanha, seg-sab, POR_DIA por dia dentro das janelas, espacados com folga aleatoria
function* horarios() {
  const d = new Date(Date.now() - 3 * 3600e3); // agora em Brasilia (como se fosse UTC)
  d.setUTCDate(d.getUTCDate() + 1);
  for (;;) {
    if (d.getUTCDay() !== 0) {
      const slots = [];
      for (const [h1, m1, h2, m2] of JANELAS) for (let t = h1 * 60 + m1; t < h2 * 60 + m2; t += 1) slots.push(t);
      const passo = Math.floor(slots.length / POR_DIA);
      for (let i = 0; i < POR_DIA; i++) {
        const min = slots[i * passo + Math.floor(Math.random() * Math.max(1, passo - 1))];
        yield new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), Math.floor(min / 60) + 3, min % 60, Math.floor(Math.random() * 60)));
      }
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
const h = horarios();
for (const x of lista) x.enviarEm = h.next().value;

console.log('fora da lista:', JSON.stringify(motivos));
console.log('vao receber:', lista.length, '| dias de envio:', Math.ceil(lista.length / POR_DIA), '| primeiro:', lista[0]?.enviarEm.toISOString(), '| ultimo:', lista[lista.length - 1]?.enviarEm.toISOString());
console.log('com medida na mensagem:', lista.filter((x) => /pneus \d/.test(x.mensagem)).length);
for (const x of lista.slice(0, 5)) console.log(`- ${x.enviarEm.toISOString()} ${x.numero.slice(0, 6)}… (${x.dias}d) ${x.mensagem}`);

if (GRAVAR) {
  const esc = (s) => String(s).replace(/'/g, "''");
  const linhas = lista.map((x) => `('${crypto.randomUUID()}', '${esc(x.cliente)}', '${x.numero}', '${esc(x.mensagem)}', '${x.enviarEm.toISOString()}', '${JOSY}', 'pendente', true, 'texto', 'robo-recuperacao 22/10 ${x.id}', now(), now())`);
  for (let i = 0; i < linhas.length; i += 200) {
    sql(`insert into "Agendamento" (id, cliente, numero, mensagem, "enviarEm", "criadoPorId", status, "cancelarSeResponder", tipo, observacoes, "criadoEm", "atualizadoEm") values ${linhas.slice(i, i + 200).join(',')};`);
  }
  console.log('GRAVADOS:', sql(`select count(*) from "Agendamento" where observacoes like 'robo-recuperacao 22/10%';`)[0][0]);
}
