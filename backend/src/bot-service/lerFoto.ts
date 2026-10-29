import express from 'express';
import jwt from 'jsonwebtoken';
import { ANTHROPIC_VERSION, ehChaveAnthropic } from '../services/llmAnthropic';

// LEITURA AUTOMÁTICA PELA FOTO (app GP Premium 1.1.6): o mecânico tira a foto do DOT/etiqueta
// do pneu ou do odômetro e o app pede aqui a leitura; o app PREENCHE o campo e o mecânico confere.
// Fica no bot-service (reload seguro), em /api/cerebro/ler-foto (o nginx já manda /api/cerebro/ pra cá).
// A foto NÃO é guardada: vai só pra API da Anthropic e some com a requisição.
//   POST { tipo: 'dot' | 'odometro', fotoBase64: data-URL JPEG }
//   -> { ok, valor, medida?, marca?, serie?, confianca: 'alta' | 'media' | 'baixa' }
// Confiança baixa ou nada achado -> valor '' (o app mostra "Não consegui ler, digite").

const TAM_MAX_FOTO = 3 * 1024 * 1024; // bytes da imagem (depois de decodificar o base64)
const TEMPO_MAX_MS = 25_000;
const MODELO = process.env.ANTHROPIC_MODEL_LER_FOTO || 'claude-sonnet-5-5';

// Login do app da loja = JWT do CRM. Vale master/admin ou quem tem o módulo garantia50k no token
// (este serviço não tem banco: confere o que o login gravou no token, como o painel faz no front).
function podeLer(req: express.Request): boolean {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = process.env.JWT_SECRET || '';
  if (!token || !s) return false;
  try {
    const d: any = jwt.verify(token, s);
    if (['master', 'admin'].includes(String(d?.role))) return true;
    const mods: unknown = d?.modulos;
    return Array.isArray(mods) && mods.map(String).includes('garantia50k');
  } catch { return false; }
}

const SCHEMA_DOT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dot: { type: 'string', description: 'Os 4 dígitos finais do código DOT (semana + ano, ex.: "3524" = semana 35 de 2024). Vazio se não der pra ler.' },
    serie: { type: 'string', description: 'O código DOT completo como está escrito no pneu (ex.: "DOT 4B1L AB12 3524"). Vazio se não der pra ler.' },
    medida: { type: 'string', description: 'Medida do pneu no formato 175/70R14 (sem espaços). Vazio se não aparecer.' },
    marca: { type: 'string', description: 'Marca escrita no pneu. Vazio se não aparecer.' },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Certeza da leitura do DOT de 4 dígitos.' },
  },
  required: ['dot', 'serie', 'medida', 'marca', 'confianca'],
};
const SCHEMA_ODO = {
  type: 'object',
  additionalProperties: false,
  properties: {
    km: { type: 'string', description: 'Quilometragem TOTAL do odômetro, só dígitos (ex.: "84350"). Não use o parcial (TRIP A/B). Vazio se não der pra ler.' },
    confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Certeza da leitura do km total.' },
  },
  required: ['km', 'confianca'],
};

const PROMPT_DOT = 'Foto da lateral/etiqueta de um pneu tirada por um mecânico numa loja de pneus. Leia o código DOT: os 4 dígitos finais (semana de 01 a 53 + ano com 2 dígitos) são o que importa. Leia também, se aparecerem, a medida (ex.: 175/70R14) e a marca. Não invente: se o DOT não estiver legível, devolva dot vazio e confiança baixa. Confiança alta só se os 4 dígitos estão nítidos.';
const PROMPT_ODO = 'Foto do painel de um carro tirada por um mecânico. Leia a quilometragem TOTAL do odômetro (não o hodômetro parcial TRIP). Não invente: se não estiver legível, devolva km vazio e confiança baixa. Confiança alta só se todos os dígitos estão nítidos.';

const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

// Semana 01-53 + ano até o ano atual (DOT de 4 dígitos, pneus de 2000 pra cá).
function dotValido(d: string): boolean {
  if (!/^\d{4}$/.test(d)) return false;
  const semana = Number(d.slice(0, 2));
  const ano = 2000 + Number(d.slice(2));
  return semana >= 1 && semana <= 53 && ano <= new Date().getFullYear();
}
function medidaNormal(m: unknown): string {
  const t = String(m ?? '').toUpperCase().replace(/\s+/g, '').replace(/ZR/, 'R');
  const x = t.match(/^(\d{3})\/(\d{2})R(\d{2})/);
  return x ? `${x[1]}/${x[2]}R${x[3]}` : '';
}

export async function rotaLerFoto(req: express.Request, res: express.Response) {
  if (!podeLer(req)) return res.status(401).json({ error: 'Não autenticado.' });
  const tipo = String(req.body?.tipo || '');
  if (tipo !== 'dot' && tipo !== 'odometro') return res.status(400).json({ error: 'tipo deve ser "dot" ou "odometro".' });
  const bruto = String(req.body?.fotoBase64 || '');
  const m = bruto.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/);
  const mediaType = m ? (m[1] === 'image/jpg' ? 'image/jpeg' : m[1]!) : 'image/jpeg';
  const dados = (m ? m[2]! : bruto).replace(/\s/g, '');
  if (!dados || !/^[A-Za-z0-9+/]+=*$/.test(dados)) return res.status(400).json({ error: 'Foto inválida.' });
  if (Math.floor((dados.length * 3) / 4) > TAM_MAX_FOTO) return res.status(413).json({ error: 'Foto grande demais (máx. 3 MB).' });

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || !ehChaveAnthropic(apiKey)) return res.status(503).json({ error: 'Leitura automática indisponível.' });

  const vazio = { ok: true, valor: '', confianca: 'baixa' as const };
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json',
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2000,
        // Leitura de foto é rápida: esforço baixo (o app espera no máximo 25 s).
        output_config: { effort: 'low', format: { type: 'json_schema', schema: tipo === 'dot' ? SCHEMA_DOT : SCHEMA_ODO } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: dados } },
            { type: 'text', text: tipo === 'dot' ? PROMPT_DOT : PROMPT_ODO },
          ],
        }],
      }),
      signal: AbortSignal.timeout(TEMPO_MAX_MS),
    });
    const body: any = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[LerFoto] API recusou:', resp.status, body?.error?.message);
      return res.status(502).json({ error: 'Não foi possível ler a foto agora.' });
    }
    if (body?.stop_reason === 'refusal') return res.json(vazio);
    const texto = (Array.isArray(body?.content) ? body.content : []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    let r: any = null;
    try { r = JSON.parse(texto); } catch { return res.json(vazio); }
    const confianca = ['alta', 'media', 'baixa'].includes(r?.confianca) ? r.confianca : 'baixa';

    if (tipo === 'dot') {
      const dot = soDigitos(r?.dot).slice(-4);
      const medida = medidaNormal(r?.medida);
      const marca = String(r?.marca || '').trim().slice(0, 40);
      const serie = String(r?.serie || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40);
      const ok = dotValido(dot) && confianca !== 'baixa';
      console.log(`[LerFoto] dot ${ok ? dot : '-'} (${confianca})${medida ? ' ' + medida : ''}`);
      return res.json({ ok: true, valor: ok ? dot : '', confianca: ok ? confianca : 'baixa', ...(ok && serie ? { serie } : {}), ...(medida ? { medida } : {}), ...(marca ? { marca } : {}) });
    }
    const km = soDigitos(r?.km).replace(/^0+(?=\d)/, '');
    const ok = km.length >= 1 && km.length <= 7 && confianca !== 'baixa';
    console.log(`[LerFoto] odometro ${ok ? km : '-'} (${confianca})`);
    return res.json({ ok: true, valor: ok ? km : '', confianca: ok ? confianca : 'baixa' });
  } catch (e: any) {
    console.error('[LerFoto] falha:', e?.name === 'TimeoutError' ? 'timeout 25 s' : e?.message);
    return res.status(504).json({ error: 'A leitura da foto demorou demais.' });
  }
}
