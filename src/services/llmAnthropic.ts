// Cliente minimo da API de mensagens da Anthropic (fetch puro, sem SDK: o servidor nao precisa de
// `npm install` novo). Usado pelo extrator do fluxo (saida estruturada via tool use forcado) e pela
// IA livre do bot-service. A chave real comeca com "sk-ant-" (o "apikey_..." do console e so o ID).

export const ANTHROPIC_VERSION = '2023-06-01';

export function ehChaveAnthropic(chave: string | undefined | null): boolean {
  return String(chave || '').trim().startsWith('sk-ant-');
}

// Chave do fluxo: Anthropic se existir (e LLM_PROVIDER nao forcar openai), senao OpenAI (comportamento antigo).
export function chaveDoFluxo(): string | undefined {
  const forcarOpenai = (process.env.LLM_PROVIDER || '').trim().toLowerCase() === 'openai';
  const ant = process.env.ANTHROPIC_API_KEY?.trim();
  if (ant && !forcarOpenai) return ant;
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

type BlocoConteudo =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface MensagemAnthropic {
  role: 'user' | 'assistant';
  content: string | BlocoConteudo[];
}

async function postar(apiKey: string, corpo: Record<string, any>, timeoutMs: number): Promise<{ ok: boolean; status: number; body: any }> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    // Chave de USUARIO (sk-ant-usr-...) nao e presa a um workspace: a API exige o header com o ID do workspace.
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json', ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}) },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body: any = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, body };
}

// Modelos recentes podem recusar `temperature`: se o 400 reclamar disso, repete sem ele.
async function postarComFallbackTemperatura(apiKey: string, corpo: Record<string, any>, timeoutMs: number) {
  let r = await postar(apiKey, corpo, timeoutMs);
  if (r.status === 400 && 'temperature' in corpo && /temperature/i.test(String(r.body?.error?.message || ''))) {
    const { temperature: _t, ...semTemp } = corpo;
    r = await postar(apiKey, semTemp, timeoutMs);
  }
  return r;
}

/**
 * Saida estruturada: obriga o modelo a "chamar" uma ferramenta cujo input_schema e o schema pedido
 * e devolve o objeto (como texto JSON). Temperatura 0: classificar mensagem nao tem espaco pra criatividade.
 * null = falha (o chamador cai na IA livre, fail-safe).
 */
export async function extrairEstruturadoAnthropic(args: {
  apiKey: string;
  model: string;
  system: string;
  usuario: string;
  schema: Record<string, any>;
  nomeFerramenta: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const r = await postarComFallbackTemperatura(args.apiKey, {
    model: args.model,
    max_tokens: 1500,
    temperature: 0,
    system: args.system,
    messages: [{ role: 'user', content: args.usuario }],
    tools: [{ name: args.nomeFerramenta, description: 'Registra o resultado da leitura das mensagens do cliente.', input_schema: args.schema }],
    tool_choice: { type: 'tool', name: args.nomeFerramenta },
  }, args.timeoutMs ?? 25_000);
  if (!r.ok) {
    console.error('[Anthropic][Extrator] Falha na API:', r.status, r.body?.error?.message);
    return null;
  }
  const bloco = (Array.isArray(r.body?.content) ? r.body.content : []).find((b: any) => b?.type === 'tool_use');
  if (!bloco?.input || typeof bloco.input !== 'object') return null;
  return JSON.stringify(bloco.input);
}

/** Texto livre (IA livre do bot-service). Devolve o texto da resposta; lanca erro se a API recusar. */
export async function gerarTextoAnthropic(args: {
  apiKey: string;
  model: string;
  system: string;
  mensagens: MensagemAnthropic[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const r = await postarComFallbackTemperatura(args.apiKey, {
    model: args.model,
    max_tokens: args.maxTokens ?? 1200,
    temperature: 0.3,
    system: args.system,
    messages: args.mensagens,
  }, args.timeoutMs ?? 55_000);
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${r.body?.error?.message || 'resposta invalida'}`);
  return (Array.isArray(r.body?.content) ? r.body.content : [])
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
}
