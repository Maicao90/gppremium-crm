// Le cada conversa da GP (texto + audios transcritos) com o Claude e extrai, de forma estruturada, como a
// Josy atendeu: situacoes, o que ela respondeu (texto/audio), o que funcionou, resultado e se vale recuperar.
//
// Uso (na pasta /root/josy-analise, chave em /root/whatsapp-crm/backend/.env):
//   node analisar.mjs teste 3            -> chamada normal em 3 conversas, imprime o resultado
//   node analisar.mjs enviar             -> manda TODAS (que ainda nao tem resultado) num lote (Batch API, 50% mais barato)
//   node analisar.mjs status             -> situacao do lote
//   node analisar.mjs baixar             -> grava os resultados em resultados.jsonl
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync("/root/whatsapp-crm/backend/.env", "utf8");
const chave = (ENV.match(/^ANTHROPIC_API_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
if (!chave) throw new Error("ANTHROPIC_API_KEY nao achada no .env");
// a chave da GP nao e de um workspace so: precisa do cabecalho com o workspace (igual o robo faz em llmAnthropic.ts)
const workspace = (ENV.match(/^ANTHROPIC_WORKSPACE_ID=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
const client = new Anthropic({ apiKey: chave, defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : {} });

const MODELO = "claude-opus-5-5";
const PASTA = path.join(AQUI, "conversas");
const SAIDA = path.join(AQUI, "resultados.jsonl");
const ESTADO = path.join(AQUI, "lote.json");

const SISTEMA = `Você é analista de atendimento da Pneus GP Premium (Luziânia-GO). Vai ler UMA conversa de WhatsApp entre um cliente e a loja e extrair, com precisão, como o atendimento aconteceu.

Contexto da loja:
- Vende pneus GP Premium. O pneu É REMOLD (remoldado), com borracha padrão europeu e controle de qualidade; garantia de 2 anos e 60 mil km ou dinheiro de volta.
- A atendente principal é a Josy (às vezes outras pessoas no mesmo número). Desde 10/2026 um ROBÔ também responde; nas linhas ele aparece como "ROBÔ". "LOJA" é a atendente humana.
- Promoções comuns: "compre 3 leve 4", parcelamento em até 10x no cartão, desconto à vista em dinheiro. A loja também faz alinhamento/balanceamento na oficina e às vezes vende pneu novo importado ou de outra marca.
- Muitos clientes chegam por anúncio (mensagem começando com "📢 [Anúncio]").
- Áudios aparecem transcritos entre aspas, com o arquivo em {audio:...}. Transcrição automática pode ter pequenos erros.

Regras da análise:
- Leia a conversa INTEIRA antes de responder. Seja fiel: não invente o que não está escrito.
- "situacao" é um rótulo curto em snake_case, em português, do que o cliente quer/sente naquele momento. Use, sempre que servir, um destes: saudacao, pede_preco, informa_medida, informa_carro, nao_sabe_medida, pergunta_se_e_remold, desconfia_qualidade, pergunta_garantia, pede_desconto, pergunta_pix_dinheiro, pede_parcelamento, compre3leve4, compara_outra_loja, acha_caro, pergunta_localizacao, pergunta_horario, quer_agendar_ou_ir, pergunta_servico_oficina, pergunta_entrega, quer_outra_marca_ou_novo, pneu_fora_da_tabela, pede_foto_ou_video, vai_pensar, sumiu, retorno_depois_de_dias, pos_venda_problema, fornecedor_ou_parceiro, curriculo, pessoal, outro. Se nenhum servir, crie um novo rótulo curto.
- Para cada momento, descreva o que a LOJA fez (ou o robô). Se foi áudio, informe o arquivo exatamente como aparece em {audio:...}.
- "audios_reutilizaveis": SÓ áudios da LOJA que serviriam para QUALQUER cliente na mesma situação: sem nome de pessoa, sem preço/medida/carro específico daquele cliente, sem data/hora específica. Na dúvida, generico=false.
- "frases_que_funcionaram": frases da loja (texto ou trecho de áudio) que fizeram o cliente avançar (mandar medida, aceitar preço, marcar ida, fechar). Copie fielmente, sem nomes de clientes.
- "resultado": avalie pelo que a conversa mostra. "fechou_ou_agendou" só se o cliente confirmou compra, ida marcada ou chegou na loja.
- "recuperacao": vale_recuperar=true quando o cliente recebeu preço ou demonstrou interesse e sumiu, ou disse "vou pensar", sem ter fechado e sem ter dito que comprou em outro lugar. Sugira uma mensagem curta, no tom da Josy, para retomar (sem inventar preço/promoção que não esteja na conversa).
- "erros_da_loja_ou_robo": falhas concretas (preço errado, não respondeu pergunta, demorou muito, robô repetiu, informação contraditória). Vazio se não houver.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["e_atendimento_de_venda", "resumo", "origem", "cliente", "momentos", "audios_reutilizaveis", "frases_que_funcionaram", "resultado", "motivo_perda", "erros_da_loja_ou_robo", "recuperacao"],
  properties: {
    e_atendimento_de_venda: { type: "boolean", description: "false para fornecedor, currículo, pessoal, spam, grupo" },
    resumo: { type: "string", description: "2 a 4 frases" },
    origem: { type: "string", enum: ["anuncio", "organico", "retorno_cliente_antigo", "indicacao", "desconhecida"] },
    cliente: {
      type: "object", additionalProperties: false, required: ["carro", "medidas", "quantidade", "cidade_ou_bairro"],
      properties: {
        carro: { type: ["string", "null"] },
        medidas: { type: "array", items: { type: "string" } },
        quantidade: { type: ["integer", "null"] },
        cidade_ou_bairro: { type: ["string", "null"] },
      },
    },
    momentos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["situacao", "cliente_disse", "quem_respondeu", "loja_fez", "formato", "audio_arquivo", "funcionou"],
        properties: {
          situacao: { type: "string" },
          cliente_disse: { type: "string", description: "resumo ou trecho curto" },
          quem_respondeu: { type: "string", enum: ["loja", "robo", "ninguem"] },
          loja_fez: { type: "string", description: "o que a loja respondeu/fez, resumido fielmente" },
          formato: { type: "string", enum: ["texto", "audio", "foto", "video", "localizacao", "nada"] },
          audio_arquivo: { type: ["string", "null"] },
          funcionou: { type: "string", enum: ["sim", "nao", "incerto"] },
        },
      },
    },
    audios_reutilizaveis: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["arquivo", "situacao", "o_que_diz", "generico"],
        properties: { arquivo: { type: "string" }, situacao: { type: "string" }, o_que_diz: { type: "string" }, generico: { type: "boolean" } },
      },
    },
    frases_que_funcionaram: { type: "array", items: { type: "string" } },
    resultado: { type: "string", enum: ["fechou_ou_agendou", "foi_na_loja_sem_confirmar", "sumiu_depois_do_preco", "sumiu_antes_do_preco", "vai_pensar", "desistiu_ou_comprou_em_outro_lugar", "em_andamento", "nao_e_venda"] },
    motivo_perda: { type: ["string", "null"] },
    erros_da_loja_ou_robo: { type: "array", items: { type: "string" } },
    recuperacao: {
      type: "object", additionalProperties: false, required: ["vale_recuperar", "por_que", "mensagem_sugerida"],
      properties: { vale_recuperar: { type: "boolean" }, por_que: { type: "string" }, mensagem_sugerida: { type: ["string", "null"] } },
    },
  },
};

function listarConversas() {
  const out = [];
  for (const mes of fs.readdirSync(PASTA)) {
    const d = path.join(PASTA, mes);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith(".txt")) out.push({ id: f.replace(".txt", ""), arquivo: path.join(d, f) });
  }
  return out.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

function jaFeitos() {
  const s = new Set();
  if (fs.existsSync(SAIDA)) for (const l of fs.readFileSync(SAIDA, "utf8").split("\n")) { try { s.add(JSON.parse(l).id); } catch {} }
  return s;
}

function params(texto) {
  return {
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Analise esta conversa:\n\n${texto}` }],
  };
}

function textoDaResposta(msg) {
  const t = msg.content.find((b) => b.type === "text");
  return t ? t.text : null;
}

const modo = process.argv[2];
if (modo === "teste") {
  const n = Number(process.argv[3] || 3);
  const todas = listarConversas().filter((c) => fs.statSync(c.arquivo).size > 1500);
  const amostra = [todas[Math.floor(todas.length * 0.3)], todas[Math.floor(todas.length * 0.6)], todas[Math.floor(todas.length * 0.9)]].slice(0, n);
  for (const c of amostra) {
    const r = await client.messages.create(params(fs.readFileSync(c.arquivo, "utf8")));
    if (r.stop_reason === "refusal") { console.log(c.id, "RECUSOU"); continue; }
    console.log(`\n===== ${c.id} | in=${r.usage.input_tokens} cache_w=${r.usage.cache_creation_input_tokens} cache_r=${r.usage.cache_read_input_tokens} out=${r.usage.output_tokens}`);
    console.log(textoDaResposta(r));
  }
} else if (modo === "enviar") {
  const feitos = jaFeitos();
  const pend = listarConversas().filter((c) => !feitos.has(c.id));
  const requests = pend.map((c) => ({ custom_id: c.id, params: params(fs.readFileSync(c.arquivo, "utf8")) }));
  const lote = await client.messages.batches.create({ requests });
  fs.writeFileSync(ESTADO, JSON.stringify({ id: lote.id, criado: new Date().toISOString(), total: requests.length }, null, 1));
  console.log("lote", lote.id, "com", requests.length, "conversas");
} else if (modo === "status") {
  const { id } = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  const b = await client.messages.batches.retrieve(id);
  console.log(b.processing_status, JSON.stringify(b.request_counts));
} else if (modo === "baixar") {
  const { id } = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  const feitos = jaFeitos();
  const out = fs.createWriteStream(SAIDA, { flags: "a" });
  const cont = { ok: 0, erro: 0, uso_in: 0, uso_out: 0, cache_r: 0 };
  for await (const r of await client.messages.batches.results(id)) {
    if (feitos.has(r.custom_id)) continue;
    if (r.result.type !== "succeeded" || r.result.message.stop_reason === "refusal") { cont.erro++; continue; }
    const msg = r.result.message;
    cont.uso_in += msg.usage.input_tokens; cont.uso_out += msg.usage.output_tokens; cont.cache_r += msg.usage.cache_read_input_tokens || 0;
    try { out.write(JSON.stringify({ id: r.custom_id, ...JSON.parse(textoDaResposta(msg)) }) + "\n"); cont.ok++; } catch { cont.erro++; }
  }
  out.end();
  console.log(JSON.stringify(cont));
} else {
  console.log("modos: teste N | enviar | status | baixar");
}
