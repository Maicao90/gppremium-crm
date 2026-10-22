// REVISAO DIARIA DO CEREBRO (22/10): le as conversas que o robo respondeu no dia, acha onde ele errou e sugere
// um ensinamento pra cada erro. Nada muda no robo sem o dono aprovar no painel (Cerebro do robo).
// Uso: ts-node --transpile-only -r dotenv/config scripts/cerebro-revisao.ts [AAAA-MM-DD]   (padrao: hoje, Brasilia)
// Roda pelo cron 1x por dia e pelo botao "Revisar agora". So le o banco; processo separado, prioridade baixa.
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { chaveDoFluxo, gerarTextoAnthropic } from '../src/services/llmAnthropic';
import { TABELA_PRECOS_GP, extrairMedidasDoTexto } from '../src/data/tabelaPrecos';

const RAIZ = path.resolve(__dirname, '..');
const PASTA = path.join(RAIZ, 'data/cerebro');
const PASTA_REVISOES = path.join(PASTA, 'revisoes');
const ARQ_TRAVA = path.join(PASTA, 'revisao-rodando.json');
const MODELO = process.env.ANTHROPIC_MODEL_REVISAO || 'claude-sonnet-5-5';
const prisma = new PrismaClient();

const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const horaBR = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
const lerTexto = (arq: string) => { try { return fs.readFileSync(arq, 'utf8').trim(); } catch { return ''; } };
const lerJson = (arq: string, padrao: any) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };

function linhaDaMensagem(m: any): string {
  const quem = !m.fromMe ? 'CLIENTE' : m.enviadoPorId === 'bot' ? 'ROBO' : 'ATENDENTE';
  let texto = String(m.texto || '').replace(/\s+/g, ' ').trim();
  const arq = m.midiaUrl ? path.basename(String(m.midiaUrl)) : '';
  if (m.tipo === 'audio') {
    const t = arq ? lerTexto(path.join(RAIZ, 'data/transcricoes', arq + '.txt')) : '';
    texto = t ? `(áudio) ${t}` : texto ? `(áudio) ${texto}` : '(áudio sem transcrição)';
  } else if (m.tipo === 'imagem') {
    const t = arq ? lerTexto(path.join(RAIZ, 'data/leituras-imagem', arq + '.txt')) : '';
    texto = `(foto${t ? ': ' + t.replace(/\s+/g, ' ') : ''})${texto ? ' ' + texto : ''}`;
  } else if (m.tipo && m.tipo !== 'texto') texto = `(${m.tipo})${texto ? ' ' + texto : ''}`;
  return `${horaBR(m.timestamp)} ${quem}: ${texto.slice(0, 700)}`;
}

function linhasDaTabela(transcricao: string): string {
  const medidas = Array.from(new Set(extrairMedidasDoTexto(transcricao)));
  const itens = TABELA_PRECOS_GP.filter((i) => medidas.includes(i.medida));
  if (!itens.length) return '(nenhuma medida da tabela citada)';
  return itens.map((i) => `${i.medida} ${i.modelo}${i.promocao ? ' [PROMOCAO]' : ''}${i.compre3Leve4 ? ' [COMPRE 3 LEVE 4: 4 pneus pagam 3]' : ''}: a vista R$ ${i.aVista.toFixed(2)} | total em 10x R$ ${i.parcelado.x10.toFixed(2)} (10 parcelas de R$ ${(i.parcelado.x10 / 10).toFixed(2)}) | total em 4x R$ ${i.parcelado.x4.toFixed(2)}`).join('\n');
}

const INSTRUCAO = `Voce e o auditor do robo de atendimento de uma loja de pneus (GP Premium, Luziania-GO) no WhatsApp.
Recebe UMA conversa (CLIENTE, ROBO e ATENDENTE humana) e a tabela de precos das medidas citadas.
Aponte SO os erros do ROBO (nunca julgue a atendente). Conta como erro do robo:
- preco/parcela/total diferente da tabela (confira quantidade, promocao compre 3 leve 4, parcelas);
- pedir de novo a medida/quantidade que o cliente ja disse; perguntar coisa desnecessaria;
- nao entender a pergunta ou responder outro assunto; ignorar o que o cliente perguntou;
- contradizer a atendente ou o que a loja ja ofereceu; responder enquanto a atendente estava atendendo;
- inventar informacao; falar de audio/video/link fora de contexto; mensagem estranha ou robotica;
- deixar o cliente sem resposta quando devia responder; responder quem nao e cliente (equipe, fornecedor, candidato a vaga).
Regras da loja que o robo deve seguir: so vende GP Premium (outra marca = "so um instante que vou verificar" e a atendente assume);
o GP Premium e remold de primeira linha com garantia de 2 anos e 60 mil km; servicos (alinhamento etc.) sao feitos na oficina da loja e o valor e combinado na loja.
Para cada erro, sugira UM ensinamento curto pro robo: "situacao" (quando o cliente ...), "acao" (responder | atendente | silencio | orientar) e "resposta"
(o texto exato que o robo deve mandar — paragrafos separados por linha em branco — ou, se acao=orientar, a orientacao). Nao sugira o que ja esta nos ENSINAMENTOS ATIVOS.
IMPORTANTE: o ensinamento vale para TODOS os clientes. Escreva a "situacao" de forma GERAL (sem nome de cliente, sem medida, sem preco).
Se a resposta certa depende da medida, do preco, da quantidade ou do parcelamento do cliente, use acao="orientar" (a IA calcula pela tabela) —
NUNCA ponha preco, medida ou valor de parcela num texto fixo (acao="responder"). Texto fixo so para respostas que servem pra qualquer cliente.
Se a conversa estiver boa, devolva lista vazia. No maximo 3 erros por conversa, os mais importantes.
Responda SO com JSON: {"achados":[{"tipo":"preco|repetiu_pergunta|nao_entendeu|contradisse_atendente|atropelou_atendente|inventou|fora_de_contexto|sem_resposta|nao_era_cliente|outro","gravidade":"alta|media|baixa","resumo":"uma frase","mensagem_cliente":"trecho","resposta_robo":"trecho","sugestao":{"situacao":"...","acao":"responder","resposta":"..."}}]}`;

function lerAchados(texto: string): any[] {
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return [];
  try { const j = JSON.parse(texto.slice(ini, fim + 1)); return Array.isArray(j?.achados) ? j.achados : []; } catch { return []; }
}

async function main() {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2] || '') ? process.argv[2] as string : hojeBR();
  fs.mkdirSync(PASTA_REVISOES, { recursive: true });
  fs.writeFileSync(ARQ_TRAVA, JSON.stringify({ pid: process.pid, data, inicio: new Date().toISOString() }));
  const apiKey = chaveDoFluxo();
  if (!apiKey) throw new Error('sem chave da Anthropic');

  const ini = new Date(`${data}T00:00:00-03:00`);
  const fim = new Date(ini.getTime() + 86400000);
  const contas = await prisma.usuario.findMany({ where: { botIaAtivo: true }, select: { id: true, nome: true } });
  const licoesAtivas = (lerJson(path.join(PASTA, 'licoes.json'), []) as any[]).filter((l) => l.ativo).map((l) => `- ${l.situacao} -> ${l.acao}`).join('\n') || '(nenhum)';

  const conversas: Array<{ usuarioId: string; conta: string; chatJid: string }> = [];
  for (const c of contas) {
    const chats = await prisma.mensagem.findMany({
      where: { usuarioId: c.id, enviadoPorId: 'bot', timestamp: { gte: ini, lt: fim }, NOT: { texto: '🙋🏼‍♀️' } },
      distinct: ['chatJid'], select: { chatJid: true },
    });
    for (const ch of chats) conversas.push({ usuarioId: c.id, conta: c.nome, chatJid: ch.chatJid });
  }
  console.log(`[Cerebro] ${data}: ${conversas.length} conversas com resposta do robo`);

  const arqRev = path.join(PASTA_REVISOES, `${data}.json`);
  const anterior = lerJson(arqRev, null);
  const decididos = (anterior?.achados || []).filter((a: any) => a.status !== 'pendente');
  const achados: any[] = [];
  let analisadas = 0;

  for (const conv of conversas) {
    const msgs = await prisma.mensagem.findMany({
      where: { usuarioId: conv.usuarioId, chatJid: conv.chatJid, timestamp: { gte: new Date(ini.getTime() - 86400000), lt: fim } },
      orderBy: { timestamp: 'asc' }, take: 60,
      select: { fromMe: true, enviadoPorId: true, texto: true, tipo: true, midiaUrl: true, timestamp: true, chatNome: true, numeroReal: true },
    });
    if (!msgs.length) continue;
    const linhas = msgs.map(linhaDaMensagem);
    const transcricao = linhas.join('\n');
    const nome = [...msgs].reverse().find((m) => !m.fromMe && m.chatNome)?.chatNome || '';
    const numero = String([...msgs].reverse().find((m) => m.numeroReal)?.numeroReal || '').split(':')[0];
    try {
      const resposta = await gerarTextoAnthropic({
        apiKey, model: MODELO, system: INSTRUCAO, maxTokens: 1500, timeoutMs: 90_000,
        mensagens: [{ role: 'user', content: `ENSINAMENTOS ATIVOS:\n${licoesAtivas}\n\nTABELA DAS MEDIDAS CITADAS:\n${linhasDaTabela(transcricao)}\n\nCONVERSA (${conv.conta}):\n${transcricao}` }],
      });
      analisadas++;
      for (const a of lerAchados(resposta).slice(0, 3)) {
        if (!a?.resumo || !a?.sugestao?.situacao) continue;
        const ja = decididos.find((d: any) => d.chatJid === conv.chatJid && d.resumo === a.resumo);
        if (ja) continue;
        achados.push({
          id: 'A' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36),
          chatJid: conv.chatJid, usuarioId: conv.usuarioId, conta: conv.conta, cliente: nome, numero,
          tipo: String(a.tipo || 'outro'), gravidade: ['alta', 'media', 'baixa'].includes(a.gravidade) ? a.gravidade : 'media',
          resumo: String(a.resumo).slice(0, 300), mensagemCliente: String(a.mensagem_cliente || '').slice(0, 400), respostaRobo: String(a.resposta_robo || '').slice(0, 600),
          trecho: linhas.slice(-14),
          sugestao: { situacao: String(a.sugestao.situacao).slice(0, 400), acao: ['responder', 'atendente', 'silencio', 'orientar'].includes(a.sugestao.acao) ? a.sugestao.acao : 'orientar', resposta: String(a.sugestao.resposta || '').slice(0, 1500), lojas: [] },
          status: 'pendente',
        });
      }
    } catch (e: any) {
      console.error(`[Cerebro] falhou ${conv.chatJid}:`, e?.message || e);
    }
    console.log(`[Cerebro] ${analisadas}/${conversas.length} — achados ate agora: ${achados.length}`);
  }

  const ordem: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  achados.sort((a, b) => (ordem[a.gravidade] ?? 1) - (ordem[b.gravidade] ?? 1));
  const rev = { data, geradoEm: new Date().toISOString(), conversas: conversas.length, analisadas, achados: [...decididos, ...achados] };
  fs.writeFileSync(arqRev + '.tmp', JSON.stringify(rev, null, 2));
  fs.renameSync(arqRev + '.tmp', arqRev);
  console.log(`[Cerebro] ${data}: ${analisadas} conversas lidas, ${achados.length} achados novos.`);
}

main()
  .catch((e) => { console.error('[Cerebro] erro:', e?.message || e); process.exitCode = 1; })
  .finally(async () => { try { fs.unlinkSync(ARQ_TRAVA); } catch { /* sem trava */ } await prisma.$disconnect(); });
