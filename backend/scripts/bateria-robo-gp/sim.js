// SIMULADOR com conversas REAIS (17/11). Repassa as mensagens de clientes de verdade pelo robo do LABORATORIO
// (porta 3019, simular:true = nao envia nada a ninguem) e confere, por codigo, onde ele foge do que foi ensinado.
// Uso: node sim.js <quantas conversas> [pular]   -> grava sim-resultado.jsonl (retoma de onde parou) e imprime o resumo.
const { execSync } = require('child_process');
const fs = require('fs');
const PORTA = process.env.PORTA || 3019;
const URL = `http://127.0.0.1:${PORTA}/gerar-resposta`;
const JOSY = '34268c16-7bed-400a-bf1e-a3d9e37d8774';
const N = Number(process.argv[2] || 50);
const PULAR = Number(process.argv[3] || 0);
const ARQ = 'sim-resultado.jsonl';
const CONC = Number(process.env.CONC || 4);
const MAX_PONTOS = 6;
const psql = (sql) => execSync(`docker exec -i gp-postgres-crm psql -U postgres -d testdb -tA`, { input: sql, maxBuffer: 1 << 30 }).toString();

function carregarConversas() {
  const sql = `select json_build_object('c', "chatJid", 'm', json_agg(json_build_array("fromMe", coalesce(texto,''), tipo, extract(epoch from timestamp)::bigint, coalesce("enviadoPorId",'')) order by timestamp))
    from (select m.*, row_number() over (partition by "chatJid" order by timestamp desc) rn from "Mensagem" m
          where "usuarioId"='${JOSY}' and "chatJid" in (
            select "chatJid" from "Mensagem" where "usuarioId"='${JOSY}' and not "fromMe" and "chatJid" not like '%@g.us' and "chatJid" not like '%broadcast%'
              and timestamp > now() - interval '60 days' group by 1 having count(*) >= 2 order by max(timestamp) desc limit ${N} offset ${PULAR})) x
    where rn <= 80 group by "chatJid";`;
  return psql(sql).split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function carregarTextosFluxo() {
  try {
    const linhas = psql(`select json_build_object('chave', chave, 'partes', partes) from "FluxoResposta";`).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const o = {};
    for (const l of linhas) { let p = l.partes; if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } } if (Array.isArray(p)) o[l.chave] = p; }
    return o;
  } catch (e) { console.error('sem textosFluxo:', e.message); return {}; }
}
const conteudo = (m) => String(m[1] || (m[2] === 'imagem' ? '[imagem enviada]' : m[2] === 'audio' ? '[audio enviado]' : `[${m[2]}]`));
const AUTOMATICA = /^(🙋|Olá! Agradecemos|Agradecemos sua mensagem)/;

// Pontos de resposta: fim de cada sequencia de mensagens do cliente. So os pontos em que o robo entraria
// (nenhuma atendente humana falou nas 12h anteriores).
function pontos(conv) {
  const m = conv.m.filter((x) => x[4] !== 'meta_ai');
  const out = [];
  for (let i = 0; i < m.length; i++) {
    if (m[i][0]) continue;
    if (i + 1 < m.length && !m[i + 1][0]) continue; // nao e o fim da sequencia
    const t = m[i][3];
    const humano = m.slice(0, i).some((x) => x[0] && x[4] !== 'bot' && x[4] !== 'meta_ai' && t - x[3] < 12 * 3600 && !AUTOMATICA.test(x[1] || ''));
    if (humano) continue;
    const ini = Math.max(0, i - 39);
    const hist = m.slice(ini, i + 1);
    const ultLoja = [...hist].reverse().find((x) => x[0]);
    out.push({ idx: i, t, messages: hist.map((x) => ({ role: x[0] ? 'assistant' : 'user', content: conteudo(x) })), minutosLoja: ultLoja ? Math.max(0, Math.round((t - ultLoja[3]) / 60)) : null,
      temImagem: m[i][2] === 'imagem', real: m.slice(i + 1, i + 4).filter((x) => x[0]).map((x) => `${x[4] === 'bot' ? 'ROBO' : 'ATENDENTE'}: ${String(x[1] || `[${x[2]}]`).slice(0, 160)}`) });
  }
  return out.slice(-MAX_PONTOS);
}

async function chamar(body) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (r.ok) return j;
      if (k === 2) return { erro: j.error || `http ${r.status}` };
    } catch (e) { if (k === 2) return { erro: String(e) }; }
    await new Promise((r) => setTimeout(r, 1500 * (k + 1)));
  }
}

(async () => {
  const feitas = new Set(fs.existsSync(ARQ) ? fs.readFileSync(ARQ, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).c) : []);
  const convs = carregarConversas().filter((c) => !feitas.has(c.c));
  const textosFluxo = carregarTextosFluxo();
  console.error(`conversas a simular: ${convs.length} (ja feitas: ${feitas.size}); textos do painel: ${Object.keys(textosFluxo).length}`);
  let i = 0, pontosTotal = 0;
  const t0 = Date.now();
  async function trabalhador() {
    while (i < convs.length) {
      const conv = convs[i++];
      let estado = 'sem_estado', dados = '{}';
      const saida = [];
      for (const p of pontos(conv)) {
        const j = await chamar({ messages: p.messages, estadoPreco: estado, dadosPreco: dados, textosFluxo, minutosDesdeUltimaDaLoja: p.minutosLoja, minutosDesdeLocalizacao: null,
          agoraTeste: new Date(p.t * 1000).toISOString(), lojaBot: { nome: 'Pneus GP Premium', telefone: '', horario: '', localizacao: '', localizacaoTexto: 'na Avenida Perimetral, na Vila Guará, em Luziânia-GO' }, simular: true });
        if (j.novoEstadoPreco) estado = j.novoEstadoPreco;
        if (j.novosDadosPreco) dados = j.novosDadosPreco;
        const cliente = []; for (let k = p.messages.length - 1; k >= 0 && p.messages[k].role === 'user'; k--) cliente.unshift(p.messages[k].content);
        saida.push({ t: p.t, cliente, antes: p.messages.slice(0, p.messages.length - cliente.length).slice(-3).map((x) => `${x.role === 'user' ? 'C' : 'L'}: ${x.content.slice(0, 140)}`),
          via: j.via, acao: j.acaoTipo, chaves: j.chaves || [], mot: j.motivoLivre || '', licao: j.licao || null, partes: j.partes || [], antesInstante: j.partesAntesDoInstante || null, erro: j.erro || null, real: p.real, temImagem: p.temImagem });
        pontosTotal++;
      }
      fs.appendFileSync(ARQ, JSON.stringify({ c: conv.c, p: saida }) + '\n');
      if (i % 25 === 0) console.error(`${i}/${convs.length} conversas, ${pontosTotal} respostas, ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, trabalhador));
  console.error(`fim: ${pontosTotal} respostas em ${Math.round((Date.now() - t0) / 1000)}s`);
})();
