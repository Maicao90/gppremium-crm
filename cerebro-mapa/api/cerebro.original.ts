import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import { chaveDoFluxo, ehChaveAnthropic, extrairEstruturadoAnthropic } from '../services/llmAnthropic';

// CEREBRO DO ROBO (22/10, pedido do dono): ensinamentos ("quando o cliente X, faca Y") que o dono escreve no painel
// ou aprova a partir da revisao diaria das conversas (scripts/cerebro-revisao.ts). O robo so muda com aprovacao do
// dono — nada se ensina sozinho. Tudo fica em data/cerebro/ (este servico e sem banco).
const PASTA = path.resolve(__dirname, '../../data/cerebro');
const ARQ_LICOES = path.join(PASTA, 'licoes.json');
const PASTA_REVISOES = path.join(PASTA, 'revisoes');
const ARQ_TRAVA = path.join(PASTA, 'revisao-rodando.json');
const ARQ_LOJAS = path.resolve(__dirname, '../../data/bot-lojas.json');

export type AcaoLicao = 'responder' | 'atendente' | 'silencio' | 'orientar';
export interface Licao {
  id: string;
  situacao: string;          // "quando o cliente perguntar se entrega em casa"
  acao: AcaoLicao;           // responder com o texto | passar pra atendente | nao responder | orientar a IA
  resposta: string;          // texto (uma bolha por paragrafo) ou orientacao pra IA
  lojas: string[];           // ids de loja (bot-lojas.json); vazio = todas
  ativo: boolean;
  origem: 'dono' | 'revisao';
  criadoEm: string;
  atualizadoEm: string;
  usos: number;
  ultimoUso?: string | undefined;
}

function lerJson<T>(arq: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')) as T; } catch { return padrao; }
}
function gravarJson(arq: string, dados: unknown) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq + '.tmp', JSON.stringify(dados, null, 2));
  fs.renameSync(arq + '.tmp', arq);
}

export function lerLicoes(): Licao[] { return lerJson<Licao[]>(ARQ_LICOES, []); }
function salvarLicoes(l: Licao[]) { gravarJson(ARQ_LICOES, l); }

function lojasDoRobo(): Array<{ id: string; nome: string }> {
  const j = lerJson<Record<string, any>>(ARQ_LOJAS, {});
  return Object.entries(j).filter(([k]) => !k.startsWith('_')).map(([id, v]) => ({ id, nome: String(v?.NOME_LOJA || id) }));
}

export function licoesAtivasDaLoja(nomeLoja?: string | null): Licao[] {
  const loja = lojasDoRobo().find((l) => nomeLoja && l.nome === nomeLoja);
  return lerLicoes().filter((l) => l.ativo && (!l.lojas.length || (loja && l.lojas.includes(loja.id))));
}

export function registrarUso(id: string) {
  const l = lerLicoes();
  const x = l.find((i) => i.id === id);
  if (!x) return;
  x.usos = (x.usos || 0) + 1;
  x.ultimoUso = new Date().toISOString();
  salvarLicoes(l);
}

// Decide se as mensagens do cliente sao EXATAMENTE uma das situacoes ensinadas. Na duvida, nenhuma.
export async function casarLicao(mensagensCliente: string[], contexto: string, licoes: Licao[]): Promise<Licao | null> {
  if (!licoes.length || !mensagensCliente.join('').trim()) return null;
  const apiKey = chaveDoFluxo();
  if (!apiKey || !ehChaveAnthropic(apiKey)) return null;
  const lista = licoes.map((l) => `- ${l.id}: ${l.situacao}`).join('\n');
  const bruto = await extrairEstruturadoAnthropic({
    apiKey,
    model: process.env.ANTHROPIC_MODEL_EXTRATOR || 'claude-haiku-5-5',
    system: 'Voce confere se as ultimas mensagens de um cliente de uma loja de pneus se encaixam CLARAMENTE em uma das situacoes que o dono da loja ensinou. So escolha uma situacao se ela descrever exatamente o que o cliente esta pedindo/dizendo agora; na duvida, ou se for outro assunto, responda "nenhuma".',
    usuario: `SITUACOES ENSINADAS:\n${lista}\n\nCONVERSA RECENTE:\n${contexto || '(sem historico)'}\n\nULTIMAS MENSAGENS DO CLIENTE:\n${mensagensCliente.join('\n')}`,
    schema: {
      type: 'object',
      properties: {
        licao: { type: 'string', description: 'id da situacao que se encaixa, ou "nenhuma"' },
        certeza: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      },
      required: ['licao', 'certeza'],
    },
    nomeFerramenta: 'registrar_situacao',
    timeoutMs: 15_000,
  }).catch(() => null);
  if (!bruto) return null;
  try {
    const r = JSON.parse(bruto);
    if (r.certeza === 'baixa') return null;
    return licoes.find((l) => l.id === String(r.licao)) || null;
  } catch { return null; }
}

// Bolhas da resposta ensinada: um paragrafo (linha em branco) = uma mensagem.
export function partesDaLicao(l: Licao): string[] {
  return l.resposta.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 6);
}

// ---------------- API do painel (/api/cerebro) ----------------
type Usuario = { sub: string; role: string };
function usuarioDoToken(req: express.Request): Usuario | null {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = process.env.JWT_SECRET || '';
  if (!token || !s) return null;
  try { const d: any = jwt.verify(token, s); return { sub: String(d.sub), role: String(d.role) }; } catch { return null; }
}
const ehDono = (u: Usuario | null) => !!u && ['master', 'admin'].includes(u.role);

function revisoesDisponiveis() {
  if (!fs.existsSync(PASTA_REVISOES)) return [];
  return fs.readdirSync(PASTA_REVISOES).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(0, 60).map((f) => {
    const r = lerJson<any>(path.join(PASTA_REVISOES, f), {});
    const achados = Array.isArray(r.achados) ? r.achados : [];
    return { data: f.slice(0, 10), conversas: r.conversas || 0, achados: achados.length, pendentes: achados.filter((a: any) => a.status === 'pendente').length, geradoEm: r.geradoEm || null };
  });
}

function revisaoRodando(): any {
  const t = lerJson<any>(ARQ_TRAVA, null);
  if (!t) return null;
  try { process.kill(Number(t.pid), 0); return t; } catch { return null; }
}

function novaLicao(dados: any, origem: 'dono' | 'revisao'): Licao | string {
  const situacao = String(dados?.situacao || '').trim();
  const acao = String(dados?.acao || '') as AcaoLicao;
  const resposta = String(dados?.resposta || '').trim();
  if (situacao.length < 5) return 'Descreva a situação (quando o cliente...).';
  if (!['responder', 'atendente', 'silencio', 'orientar'].includes(acao)) return 'Escolha o que o robô deve fazer.';
  if ((acao === 'responder' || acao === 'orientar') && resposta.length < 2) return 'Escreva a resposta / orientação.';
  const agora = new Date().toISOString();
  return {
    id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    situacao: situacao.slice(0, 400), acao, resposta: resposta.slice(0, 2000),
    lojas: Array.isArray(dados?.lojas) ? dados.lojas.map(String) : [],
    ativo: dados?.ativo !== false, origem, criadoEm: agora, atualizadoEm: agora, usos: 0,
  };
}

export function rotasCerebro(urlGerarResposta: string): express.Router {
  const r = express.Router();
  r.use((req, res, next) => {
    const u = usuarioDoToken(req);
    if (!u) return res.status(401).json({ error: 'Não autenticado.' });
    if (!['master', 'admin', 'gerente'].includes(u.role)) return res.status(403).json({ error: 'Sem acesso ao cérebro do robô.' });
    (req as any).usuario = u;
    next();
  });
  const soDono = (req: express.Request, res: express.Response) => {
    if (ehDono((req as any).usuario)) return true;
    res.status(403).json({ error: 'Só o administrador pode mudar o que o robô aprende.' });
    return false;
  };

  r.get('/resumo', (_req, res) => {
    res.json({ licoes: lerLicoes().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)), revisoes: revisoesDisponiveis(), lojas: lojasDoRobo(), rodando: revisaoRodando() });
  });

  r.post('/licoes', (req, res) => {
    if (!soDono(req, res)) return;
    const l = novaLicao(req.body, 'dono');
    if (typeof l === 'string') return res.status(400).json({ error: l });
    const todas = lerLicoes(); todas.push(l); salvarLicoes(todas);
    res.json({ ok: true, licao: l });
  });

  r.put('/licoes/:id', (req, res) => {
    if (!soDono(req, res)) return;
    const todas = lerLicoes();
    const x = todas.find((i) => i.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'Ensinamento não encontrado.' });
    const nova = novaLicao({ ...x, ...req.body }, x.origem);
    if (typeof nova === 'string') return res.status(400).json({ error: nova });
    Object.assign(x, { situacao: nova.situacao, acao: nova.acao, resposta: nova.resposta, lojas: nova.lojas, ativo: nova.ativo, atualizadoEm: new Date().toISOString() });
    salvarLicoes(todas);
    res.json({ ok: true, licao: x });
  });

  r.delete('/licoes/:id', (req, res) => {
    if (!soDono(req, res)) return;
    salvarLicoes(lerLicoes().filter((i) => i.id !== req.params.id));
    res.json({ ok: true });
  });

  r.get('/revisoes/:data', (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.data)) return res.status(400).json({ error: 'Data inválida.' });
    const arq = path.join(PASTA_REVISOES, `${req.params.data}.json`);
    if (!fs.existsSync(arq)) return res.status(404).json({ error: 'Sem revisão nesse dia.' });
    res.json(lerJson<any>(arq, {}));
  });

  // Aprovar vira ensinamento (com o texto que o dono ajustou); ignorar so marca.
  r.post('/revisoes/:data/achados/:id', (req, res) => {
    if (!soDono(req, res)) return;
    const arq = path.join(PASTA_REVISOES, `${req.params.data}.json`);
    const rev = lerJson<any>(arq, null);
    const a = rev?.achados?.find((x: any) => x.id === req.params.id);
    if (!a) return res.status(404).json({ error: 'Achado não encontrado.' });
    const status = String(req.body?.status || '');
    if (status === 'aprovado') {
      const l = novaLicao(req.body?.licao || a.sugestao, 'revisao');
      if (typeof l === 'string') return res.status(400).json({ error: l });
      const todas = lerLicoes(); todas.push(l); salvarLicoes(todas);
      a.licaoId = l.id;
    } else if (status !== 'ignorado' && status !== 'pendente') return res.status(400).json({ error: 'Status inválido.' });
    a.status = status;
    a.decididoEm = new Date().toISOString();
    gravarJson(arq, rev);
    res.json({ ok: true, achado: a });
  });

  // Roda a revisao agora (processo separado, com prioridade baixa; nao mexe no WhatsApp).
  r.post('/revisar', (req, res) => {
    if (!soDono(req, res)) return;
    if (revisaoRodando()) return res.status(409).json({ error: 'Já tem uma revisão rodando.' });
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || '')) ? String(req.body.data) : '';
    const raiz = path.resolve(__dirname, '../..');
    const filho = spawn('nice', ['-n', '15', path.join(raiz, 'node_modules/.bin/ts-node'), '--transpile-only', '-r', 'dotenv/config', 'scripts/cerebro-revisao.ts', ...(data ? [data] : [])], {
      cwd: raiz, detached: true, stdio: ['ignore', fs.openSync('/root/whatsapp-crm/logs/cerebro-revisao.log', 'a'), fs.openSync('/root/whatsapp-crm/logs/cerebro-revisao.log', 'a')],
    });
    filho.unref();
    res.json({ ok: true, iniciado: true });
  });

  // Testa uma mensagem como se fosse um cliente (gera a resposta, nao manda nada pra ninguem).
  r.post('/testar', async (req, res) => {
    try {
      const mensagem = String(req.body?.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ error: 'Escreva a mensagem do cliente.' });
      const loja = lojasDoRobo().find((l) => l.id === req.body?.lojaId) || lojasDoRobo()[0];
      const historico = Array.isArray(req.body?.historico) ? req.body.historico.slice(-8).map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', content: String(h?.content || '').slice(0, 600) })) : [];
      const resp = await fetch(urlGerarResposta, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [...historico, { role: 'user', content: mensagem }], lojaBot: loja ? { nome: loja.nome } : undefined, simular: false, teste: true }),
      }).then((x) => x.json());
      res.json({ partes: resp.partes || [], via: resp.via, chaves: resp.chaves || [], licao: resp.licao || null });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Falha ao testar.' });
    }
  });

  return r;
}
