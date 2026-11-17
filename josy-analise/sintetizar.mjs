// Junta as leituras das 1.921 conversas (resultados.jsonl) em PROPOSTAS para o Cerebro, uma por situacao:
// como a Josy faz, o que funcionou, os audios dela que servem pra qualquer cliente e a resposta fixa sugerida.
// Tambem gera a lista de vendas pra recuperar e um resumo geral.
//
// Uso (em /root/josy-analise): node sintetizar.mjs
// Saidas: aprendizado-josy.json, recuperar.csv, resumo.json
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync("/root/whatsapp-crm/backend/.env", "utf8");
const ler = (k) => (ENV.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const workspace = ler("ANTHROPIC_WORKSPACE_ID");
const client = new Anthropic({ apiKey: ler("ANTHROPIC_API_KEY"), defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : {} });
const MODELO = "claude-opus-5-5";
const LOJA_GP = "72213a6c-31c5-410d-a6b4-504dfd223e2f";
const MIN_OCORRENCIAS = 8;

const CATEGORIAS = ["saudacao", "saudacao_retorno", "pedir_medida", "preco_medida", "medida_inexistente", "sem_alternativa", "parcelamento_generico",
  "parcelamento_especifico", "parcelamento_maximo", "juros", "desconto_dinheiro", "desconto_pix", "remold", "condicao", "remold_insistencia", "chines",
  "nacional", "garantia", "promocao_leve4", "visita_confirmada", "visita_sem_dia", "servico_oficina", "outra_marca", "balanceamento",
  "balanceamento_quantidade", "alinhamento", "base_troca", "compra_usado", "nota_fiscal", "localizacao", "horario", "foto", "localizacao_repetida",
  "objecao", "objecao_repetida", "agradecimento", "pedir_medida_repetida", "fornecedor", "so_pontuacao", "equipe_interna"];

// ---------- dados ----------
const resultados = fs.readFileSync(path.join(AQUI, "resultados.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const transcricao = new Map();
for (const l of fs.readFileSync(path.join(AQUI, "transcricoes.jsonl"), "utf8").split("\n")) {
  try { const r = JSON.parse(l); transcricao.set("/" + r.arquivo, { texto: r.texto, duracao: r.duracao }); } catch {}
}
const midia = (a) => (a ? "/" + String(a).replace(/^\/+/, "") : null);

// id da conversa (sha1 do chatJid) -> numero/nome, pra lista de recuperacao
const contato = new Map();
{
  const csv = fs.readFileSync("/root/josy-export/mensagens.csv", "utf8");
  for (const m of csv.matchAll(/^[^,\n]*,([^,\n]+@(?:lid|s\.whatsapp\.net)),("(?:[^"]|"")*"|[^,\n]*),/gm)) {
    const jid = m[1];
    const id = crypto.createHash("sha1").update(jid).digest("hex").slice(0, 10);
    const nome = m[2].replace(/^"|"$/g, "").replace(/""/g, '"');
    const c = contato.get(id) || { jid, nome: "" };
    if (nome && !c.nome) c.nome = nome;
    contato.set(id, c);
  }
}

// ---------- agrupamento por situacao (o que a LOJA fez) ----------
const grupos = new Map();
for (const r of resultados) {
  if (!r.e_atendimento_de_venda) continue;
  for (const mo of r.momentos || []) {
    const s = String(mo.situacao || "outro").toLowerCase().trim().replace(/\s+/g, "_");
    if (["outro", "despedida"].includes(s)) continue;
    const g = grupos.get(s) || { situacao: s, total: 0, loja: 0, sim: 0, nao: 0, exemplos: [], conversas: new Set(), audios: [] };
    g.total++;
    g.conversas.add(r.id);
    if (mo.quem_respondeu === "loja") {
      g.loja++;
      if (mo.funcionou === "sim") g.sim++;
      if (mo.funcionou === "nao") g.nao++;
      g.exemplos.push({ cliente: mo.cliente_disse, loja: mo.loja_fez, formato: mo.formato, funcionou: mo.funcionou, resultado: r.resultado });
    }
    grupos.set(s, g);
  }
  for (const a of r.audios_reutilizaveis || []) {
    if (!a.generico) continue;
    const s = String(a.situacao || "").toLowerCase().trim().replace(/\s+/g, "_");
    const g = grupos.get(s);
    const m = midia(a.arquivo);
    const t = transcricao.get(m);
    if (g && t && t.texto) g.audios.push({ midia: m, transcricao: t.texto, duracao: t.duracao, resultado: r.resultado });
  }
}
// frases que funcionaram, por situacao (vem da conversa inteira; liga pelas situacoes que a conversa teve)
const frasesPorSituacao = new Map();
for (const r of resultados) {
  const sits = new Set((r.momentos || []).filter((m) => m.quem_respondeu === "loja").map((m) => String(m.situacao).toLowerCase()));
  for (const f of r.frases_que_funcionaram || []) for (const s of sits) {
    const lista = frasesPorSituacao.get(s) || [];
    lista.push(f);
    frasesPorSituacao.set(s, lista);
  }
}

const candidatas = [...grupos.values()].filter((g) => g.loja >= MIN_OCORRENCIAS).sort((a, b) => b.loja - a.loja);
console.log(`${resultados.length} conversas lidas; ${grupos.size} situacoes; ${candidatas.length} com ${MIN_OCORRENCIAS}+ respostas da loja`);

// ---------- uma proposta por situacao (Claude escreve a resposta fixa a partir do que a Josy fez) ----------
const SISTEMA = `Você monta respostas FIXAS para o robô de WhatsApp da Pneus GP Premium (Luziânia-GO), a partir de como a atendente Josy atende de verdade.
Fatos da loja (sempre valem):
- O pneu GP Premium É REMOLD, com borracha padrão europeu e controle de qualidade; garantia de 2 anos e 60 mil km ou dinheiro de volta.
- Parcelamento em até 10x no cartão; promoção "compre 3 leve 4" em alguns pneus; desconto à vista em DINHEIRO (Pix não tem desconto).
- Serviços de oficina (alinhamento, balanceamento, montagem) são feitos na oficina da loja e os valores são combinados com os meninos da oficina.
- Pedido de outra marca ou pneu novo/importado: o robô diz "só um instante" e passa para a atendente (acao "atendente").
REGRAS DURAS:
- NUNCA escreva preço (R$), valor de parcela ou medida de pneu dentro da resposta fixa. Preço sempre vem da tabela oficial (TAB.7), calculado pelo robô. Se a situação depende de preço/medida, use acao "orientar" e escreva na "resposta" a ORIENTAÇÃO para o robô (como a Josy conduziria), sem números.
- Nada de nome de cliente, data específica ou promessa que não esteja nos fatos acima.
- Tom da Josy: curto, simpático, direto, sem formalidade. Cada parágrafo da resposta vira uma bolha de WhatsApp (no máximo 3 bolhas).
- "situacao" é escrita como gatilho, começando com "quando o cliente ..." — geral o bastante para servir a vários clientes.
- Escolha até 3 áudios da lista que sirvam para QUALQUER cliente nessa situação (sem nome, sem preço/medida/carro específico, sem data). Se nenhum servir, devolva lista vazia.`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["titulo", "quando", "comoJosyFaz", "acao", "situacaoGatilho", "resposta", "ligadoA", "audiosEscolhidos", "vale_a_pena"],
  properties: {
    titulo: { type: "string" },
    quando: { type: "string" },
    comoJosyFaz: { type: "string", description: "3 a 5 frases sobre o jeito dela nessa situação e o que funciona" },
    acao: { type: "string", enum: ["responder", "orientar", "atendente", "silencio"] },
    situacaoGatilho: { type: "string" },
    resposta: { type: "string" },
    ligadoA: { type: "string", enum: [...CATEGORIAS.map((c) => `categoria:${c}`), "nenhum"] },
    audiosEscolhidos: { type: "array", items: { type: "string" } },
    vale_a_pena: { type: "boolean", description: "false se a situação não deve virar resposta fixa (ex.: varia demais, é pessoal)" },
  },
};

const propostas = [];
for (const g of candidatas) {
  const exemplos = [...g.exemplos.filter((e) => e.funcionou === "sim"), ...g.exemplos.filter((e) => e.funcionou !== "sim")].slice(0, 30);
  const frases = [...new Set(frasesPorSituacao.get(g.situacao) || [])].slice(0, 25);
  const audios = g.audios.sort((a, b) => (b.resultado === "fechou_ou_agendou") - (a.resultado === "fechou_ou_agendou")).slice(0, 12);
  const entrada = [
    `SITUAÇÃO: ${g.situacao} — aconteceu ${g.total} vezes (${g.loja} respondidas pela loja; funcionou ${g.sim}, não funcionou ${g.nao}).`,
    "", "EXEMPLOS (cliente → o que a loja fez):",
    ...exemplos.map((e, i) => `${i + 1}. [${e.formato}${e.funcionou === "sim" ? ", funcionou" : e.funcionou === "nao" ? ", NÃO funcionou" : ""}; conversa terminou: ${e.resultado}] cliente: ${e.cliente} → loja: ${e.loja}`),
    "", "FRASES DA LOJA QUE FIZERAM O CLIENTE AVANÇAR (nessas conversas):", ...frases.map((f) => `- ${f}`),
    "", "ÁUDIOS DA JOSY CANDIDATOS (arquivo → o que ela diz):", ...(audios.length ? audios.map((a) => `- ${a.midia} (${a.duracao}s) → "${a.transcricao}"`) : ["(nenhum)"]),
  ].join("\n");
  let r;
  try {
    r = await client.messages.create({
      model: MODELO, max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: entrada }],
    });
  } catch (e) { console.log("erro em", g.situacao, e.message); continue; }
  if (r.stop_reason === "refusal") { console.log("recusou", g.situacao); continue; }
  const t = r.content.find((b) => b.type === "text");
  const p = JSON.parse(t.text);
  if (!p.vale_a_pena) { console.log("descartada:", g.situacao); continue; }
  const escolhidos = new Set(p.audiosEscolhidos);
  propostas.push({
    id: g.situacao,
    titulo: p.titulo,
    quando: p.quando,
    frequencia: g.total,
    respondidasPelaLoja: g.loja,
    taxaSucesso: g.loja ? Math.round((g.sim / g.loja) * 100) / 100 : null,
    comoJosyFaz: p.comoJosyFaz,
    exemplos: exemplos.filter((e) => e.funcionou === "sim").slice(0, 5).map((e) => ({ cliente: e.cliente, loja: e.loja })),
    frasesQueFuncionaram: frases.slice(0, 8),
    sugestao: { situacao: p.situacaoGatilho, acao: p.acao, resposta: p.resposta, lojas: [LOJA_GP] },
    ligadoA: p.ligadoA === "nenhum" ? null : p.ligadoA,
    audios: audios.filter((a) => escolhidos.has(a.midia)).map((a) => ({ midia: a.midia, transcricao: a.transcricao, duracao: a.duracao, vezesUsado: 1 })),
    status: "pendente",
  });
  console.log(`ok ${g.situacao}: ${p.acao}, ${escolhidos.size} audio(s)`);
}
fs.writeFileSync(path.join(AQUI, "aprendizado-josy.json"), JSON.stringify({ geradoEm: new Date().toISOString(), conversasLidas: resultados.length, propostas }, null, 1));

// ---------- vendas pra recuperar ----------
const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const linhas = [["conversa", "numero", "nome", "resultado", "medidas", "carro", "por_que", "mensagem_sugerida"].join(",")];
for (const r of resultados) {
  if (!r.recuperacao?.vale_recuperar) continue;
  const c = contato.get(r.id) || {};
  linhas.push([r.id, esc((c.jid || "").split("@")[0]), esc(c.nome), r.resultado, esc((r.cliente?.medidas || []).join(" / ")), esc(r.cliente?.carro), esc(r.recuperacao.por_que), esc(r.recuperacao.mensagem_sugerida)].join(","));
}
fs.writeFileSync(path.join(AQUI, "recuperar.csv"), "﻿" + linhas.join("\n"));

// ---------- resumo geral ----------
const conta = (f) => resultados.reduce((m, r) => { const k = f(r); if (k != null) m[k] = (m[k] || 0) + 1; return m; }, {});
const erros = resultados.flatMap((r) => r.erros_da_loja_ou_robo || []);
fs.writeFileSync(path.join(AQUI, "resumo.json"), JSON.stringify({
  conversas: resultados.length,
  resultados: conta((r) => r.resultado),
  origem: conta((r) => r.origem),
  vale_recuperar: linhas.length - 1,
  motivos_perda: resultados.map((r) => r.motivo_perda).filter(Boolean),
  erros_amostra: erros.slice(0, 400),
  situacoes: [...grupos.values()].sort((a, b) => b.total - a.total).slice(0, 60).map((g) => ({ situacao: g.situacao, total: g.total, loja: g.loja, sim: g.sim, nao: g.nao })),
}, null, 1));
console.log(`propostas: ${propostas.length}; recuperar: ${linhas.length - 1}`);
