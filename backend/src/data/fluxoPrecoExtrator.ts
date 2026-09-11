import { IntencaoExtraida, IntencaoTipo } from './fluxoPreco';

// CAMADA 1 do fluxo deterministico de preco (10/09). Unica funcao desta feature
// que fala com a OpenAI. So EXTRAI o que o cliente quis dizer, em formulario
// fixo (json_schema estrito) — nunca decide o que responder, nunca gera preco.
// Ver docs/superpowers/specs/2026-09-10-fluxo-preco-deterministico-design.md.

const SCHEMA_EXTRACAO = {
  type: 'object',
  properties: {
    intencao: {
      type: 'string',
      enum: ['DAR_MEDIDA', 'PERGUNTAR_PRECO_SEM_MEDIDA', 'RESPONDER_QUANTIDADE', 'ESCOLHER_ALTERNATIVA', 'PERGUNTA_TECNICA', 'OUTRO_ASSUNTO'],
    },
    medida_extraida: {
      type: ['string', 'null'],
      description: 'Medida do pneu no formato EXATO "LARGURA/PERFIL/ARO" (ex.: "205/55/16"), so quando o cliente deu uma medida completa nesta mensagem — normalize qualquer ordem/separador (ex.: "16r 205 55" ou "225/70 aro 17" viram "225/70/17"). null se nao houver medida completa nesta mensagem.',
    },
    quantidade_extraida: {
      type: ['integer', 'null'],
      description: 'Quantidade de pneus mencionada nesta mensagem (ex.: "preciso de 4" = 4). null se nao mencionou.',
    },
    escolha_alternativa: {
      type: ['string', 'null'],
      description: 'Se o cliente esta escolhendo uma das medidas alternativas que JA foram oferecidas a ele (contexto anterior), a medida escolhida no formato LARGURA/PERFIL/ARO. null se nao se aplica.',
    },
  },
  required: ['intencao', 'medida_extraida', 'quantidade_extraida', 'escolha_alternativa'],
  additionalProperties: false,
};

const INSTRUCAO = [
  'Voce classifica UMA mensagem de cliente de uma loja de pneus, pra um sistema que decide a resposta certa.',
  'Categorias de intencao:',
  '- DAR_MEDIDA: o cliente informou a medida do pneu (mesmo em formato estranho, tipo "16r 205 55" ou "225/70 aro 17").',
  '- PERGUNTAR_PRECO_SEM_MEDIDA: pergunta de preco/valor SEM informar a medida nesta mensagem.',
  '- RESPONDER_QUANTIDADE: informou quantos pneus quer (numero de unidades), sem dar medida nova.',
  '- ESCOLHER_ALTERNATIVA: esta escolhendo uma das opcoes que JA foram oferecidas antes (contexto da conversa).',
  '- PERGUNTA_TECNICA: pergunta sobre caracteristica do produto que NAO e preco (ex.: capacidade de carga em kg, durabilidade, garantia, se e remold).',
  '- OUTRO_ASSUNTO: qualquer outra coisa (saudacao, agradecimento, pedir endereco, reclamacao, papo solto).',
  'Na duvida entre PERGUNTA_TECNICA e as outras, prefira PERGUNTA_TECNICA — e mais seguro nao tratar como pedido de preco.',
  'NUNCA calcule nem mencione preco — isso nao e sua tarefa, so classifique e extraia.',
].join('\n');

export async function extrairIntencaoPreco(
  mensagemAtual: string,
  contextoRecente: string,
  apiKey: string
): Promise<IntencaoExtraida | null> {
  try {
    const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: INSTRUCAO }] },
          { role: 'user', content: [{ type: 'input_text', text: `Contexto recente da conversa (mais antiga primeiro):\n${contextoRecente.slice(0, 1500)}\n\nMENSAGEM ATUAL A CLASSIFICAR:\n${mensagemAtual.slice(0, 500)}` }] },
        ],
        text: { format: { type: 'json_schema', name: 'extracao_preco', strict: true, schema: SCHEMA_EXTRACAO } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[FluxoPreco][Extrator] Falha na API:', resp.status, body?.error?.message);
      return null;
    }
    const textoSaida = extrairTextoJson(body);
    if (!textoSaida) return null;
    const parsed = JSON.parse(textoSaida);
    const intencoesValidas: IntencaoTipo[] = ['DAR_MEDIDA', 'PERGUNTAR_PRECO_SEM_MEDIDA', 'RESPONDER_QUANTIDADE', 'ESCOLHER_ALTERNATIVA', 'PERGUNTA_TECNICA', 'OUTRO_ASSUNTO'];
    if (!intencoesValidas.includes(parsed.intencao)) return null;
    return {
      intencao: parsed.intencao,
      medidaExtraida: typeof parsed.medida_extraida === 'string' ? parsed.medida_extraida : null,
      quantidadeExtraida: typeof parsed.quantidade_extraida === 'number' ? parsed.quantidade_extraida : null,
      escolhaAlternativa: typeof parsed.escolha_alternativa === 'string' ? parsed.escolha_alternativa : null,
    };
  } catch (e: any) {
    console.error('[FluxoPreco][Extrator] Erro:', e?.message || e);
    return null; // falha = trata como OUTRO_ASSUNTO no chamador (fail-safe, nunca trava o cliente)
  }
}

// Mesmo padrao de extracao de texto do gerarRespostaViaOpenAI (bot-service/server.ts):
// tenta output_text no topo primeiro, senao percorre output[].content[] olhando tanto
// `text` quanto `output_text` em cada item — mantem consistencia com o unico outro
// lugar do projeto que ja fala com a Responses API de verdade.
function extrairTextoJson(payload: any): string | null {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const texto = typeof content?.text === 'string'
        ? content.text
        : typeof content?.output_text === 'string'
          ? content.output_text
          : '';
      if (texto.trim()) return texto.trim();
    }
  }
  return null;
}

// Filtro barato (nao gasta chamada de IA em papo solto obviamente fora do assunto).
// So retorna false quando tem certeza que NAO e sobre preco/medida — na duvida,
// deixa passar pro extrator decidir (ele e mais confiavel que regex).
export function podeSerSobrePreco(mensagem: string, estadoAtual: string): boolean {
  if (estadoAtual === 'aguardando_medida' || estadoAtual === 'medida_sem_match') return true; // esperando resposta especifica
  const t = String(mensagem || '').toLowerCase();
  if (/\d/.test(t)) return true; // tem numero (pode ser medida ou quantidade)
  if (/pre[cç]o|quanto|valor|vist[a-z]|parcel|cotar|cota[cç][aã]o/.test(t)) return true;
  return false;
}
