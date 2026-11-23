// APRENDIZADO AUTOMATICO (23/11, dono: "e os aprendizados? e pra ela parar de errar").
// Todo erro que a revisao diaria do Cerebro acha (data/cerebro/revisoes/*.json) vira um CASO DE TESTE permanente:
// a mesma conversa e reenviada ao robo (simular:true — nao envia nada a ninguem; com IA livre e conferente ligados)
// e um juiz confere se a resposta de HOJE ainda comete aquele erro. Sem depender de aprovar nada no painel.
// Uso: node roda-aprendidos.js [PORTA=3010] [dias=30]   -> grava data/cerebro/aprendidos-resultado.json e imprime o resumo.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const BACK = '/root/whatsapp-crm/backend';
require(path.join(BACK, 'node_modules/dotenv')).config({ path: path.join(BACK, '.env') });
const PORTA = process.env.PORTA || process.argv[2] || 3010;
const DIAS = Number(process.argv[3] || 30);
const URL = `http://127.0.0.1:${PORTA}/gerar-resposta`;
const PASTA = path.join(BACK, 'data/cerebro/revisoes');
const SAIDA = path.join(BACK, 'data/cerebro/aprendidos-resultado.json');
const MODELO = process.env.ANTHROPIC_MODEL_REVISAO || 'claude-sonnet-5-5';
const CONC = Number(process.env.CONC || 3);
const LOJA = { nome: 'Pneus GP Premium', telefone: '', horario: '', localizacao: '', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' };

const psql = (sql) => execSync('docker exec -i gp-postgres-crm psql -U postgres -d testdb -tA', { input: sql, maxBuffer: 1 << 28 }).toString();
function textosFluxo() {
  try {
    const o = {};
    for (const l of psql(`select json_build_object('chave', chave, 'partes', partes) from "FluxoResposta";`).split('\n').filter(Boolean)) {
      const j = JSON.parse(l); let p = j.partes; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
      if (Array.isArray(p) && !String(j.chave).includes(':')) o[j.chave] = p;
    }
    return o;
  } catch { return {}; }
}
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// "22/11, 14:37 CLIENTE: texto" -> { quando, quem, texto }
function lerTrecho(trecho) {
  return (trecho || []).map((l) => { const m = /^(\d{2}\/\d{2}),?\s*(\d{2}:\d{2})\s+(CLIENTE|ROBO|ATENDENTE):\s?([\s\S]*)$/.exec(String(l)); return m ? { quando: `${m[1]} ${m[2]}`, quem: m[3], texto: m[4] } : null; }).filter(Boolean);
}
// A conversa ate o ponto em que o robo errou (sem a resposta errada).
function casoDoAchado(a) {
  const linhas = lerTrecho(a.trecho);
  if (!linhas.length) return null;
  const alvo = norm(a.respostaRobo).slice(0, 30);
  let corte = alvo && !/sem resposta/.test(alvo) ? linhas.findIndex((l) => l.quem === 'ROBO' && norm(l.texto).startsWith(alvo.slice(0, 20))) : -1;
  if (corte < 0) { const ultCli = linhas.map((l) => l.quem).lastIndexOf('CLIENTE'); corte = ultCli + 1; }
  let msgs = linhas.slice(0, corte);
  while (msgs.length && msgs[msgs.length - 1].quem !== 'CLIENTE') msgs = msgs.slice(0, -1);
  if (!msgs.length) return null;
  return { messages: msgs.map((l) => ({ role: l.quem === 'CLIENTE' ? 'user' : 'assistant', content: l.texto })), conversa: msgs.map((l) => `${l.quem === 'CLIENTE' ? 'CLIENTE' : 'LOJA'}: ${l.texto}`).join('\n') };
}
async function chamarRobo(caso, tf) {
  const body = { messages: caso.messages, estadoPreco: 'sem_estado', dadosPreco: '{}', textosFluxo: tf, lojaBot: LOJA, simular: true, simularIa: true, conferir: true, minutosDesdeUltimaDaLoja: null };
  for (let k = 0; k < 2; k++) {
    try { const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }); return await r.json(); }
    catch (e) { if (k === 1) return { erro: String(e) }; }
  }
}
async function juiz(a, caso, resposta) {
  const nova = (resposta.partes || []).length ? resposta.partes.map((p, i) => `${i + 1}) ${p}`).join('\n') : '(o robo ficou em silencio)';
  const sistema = 'Voce confere se um robo de atendimento de loja de pneus no WhatsApp CORRIGIU um erro que ele cometeu antes. Seja justo: a resposta nao precisa ser perfeita, so nao pode repetir o erro descrito nem cometer outro erro grave (preco inventado, ignorar a pergunta, mandar o cliente embora). "Só um instante que eu vou verificar" (passar pra atendente) so conta como resolvido se o assunto realmente pede a atendente. Responda SO JSON: {"resolvido":true|false,"motivo":"uma frase"}';
  const usuario = `ERRO QUE O ROBO COMETEU NESSA SITUACAO: ${a.resumo}\nRESPOSTA ERRADA (antiga): ${a.respostaRobo}\n\nCONVERSA:\n${caso.conversa}\n\nRESPOSTA DO ROBO HOJE:\n${nova}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}) },
    body: JSON.stringify({ model: MODELO, max_tokens: 300, system: sistema, messages: [{ role: 'user', content: usuario }] }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  const txt = (j.content || []).map((c) => c.text || '').join('');
  const a0 = txt.indexOf('{'), z = txt.lastIndexOf('}');
  try { return JSON.parse(txt.slice(a0, z + 1)); } catch { return { resolvido: null, motivo: 'juiz sem resposta: ' + txt.slice(0, 80) }; }
}

(async () => {
  const tf = textosFluxo();
  const limite = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
  const achados = [];
  for (const f of fs.readdirSync(PASTA).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) >= limite).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(PASTA, f), 'utf8'));
    for (const a of r.achados || []) achados.push({ ...a, dia: r.data });
  }
  const resultados = [];
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < achados.length) {
      const a = achados[i++];
      const caso = casoDoAchado(a);
      if (!caso) { resultados.push({ id: a.id, dia: a.dia, tipo: a.tipo, resumo: a.resumo, resolvido: null, motivo: 'trecho sem conversa' }); continue; }
      const resp = await chamarRobo(caso, tf);
      const v = resp.erro ? { resolvido: null, motivo: 'erro do robo: ' + resp.erro } : await juiz(a, caso, resp).catch((e) => ({ resolvido: null, motivo: 'juiz falhou: ' + e.message }));
      resultados.push({ id: a.id, dia: a.dia, tipo: a.tipo, gravidade: a.gravidade, cliente: String(caso.messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' / ')).slice(0, 200), antes: a.respostaRobo, hoje: resp.partes || [], via: resp.via, chaves: resp.chaves || [], conferente: resp.conferente?.veredito || null, ...v });
      process.stderr.write('.');
    }
  }));
  const ok = resultados.filter((r) => r.resolvido === true).length, falha = resultados.filter((r) => r.resolvido === false).length, sem = resultados.length - ok - falha;
  const resumo = { rodadoEm: new Date().toISOString(), total: resultados.length, resolvidos: ok, ainda_erram: falha, sem_avaliacao: sem };
  fs.writeFileSync(SAIDA, JSON.stringify({ ...resumo, resultados }, null, 1));
  console.log(`\nAPRENDIDOS: ${ok} de ${ok + falha} erros da revisao ja saem certos hoje (${sem} sem avaliacao).`);
  for (const r of resultados.filter((r) => r.resolvido === false)) console.log(`\nAINDA ERRA [${r.dia} ${r.tipo}] ${r.motivo}\n  CLIENTE: ${r.cliente}\n  HOJE: ${(r.hoje || []).join(' / ').slice(0, 240)}`);
  for (const r of resultados.filter((r) => r.resolvido === null)) console.log(`\nSEM AVALIACAO [${r.dia}] ${r.motivo}`);
})();
