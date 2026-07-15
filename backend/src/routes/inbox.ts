import { Router } from 'express';
import { prisma } from '../server';
import { resolverConexaoEfetiva } from '../workers/whatsappService';
import { ehEscopado, idsAtendentesDaLoja } from '../auth/escopoLoja';

const router = Router();

// Gerente logado só pode mexer no WhatsApp de atendentes da própria loja.
// Retorna true se PODE seguir; se bloquear, já responde 403 e retorna false.
async function permiteAtendente(req: any, res: any, usuarioId: string): Promise<boolean> {
  if (!(await ehEscopado(req))) return true; // sem token (extensão) ou master → fluxo normal
  const ids = (await idsAtendentesDaLoja(req)) || [];
  if (ids.includes(String(usuarioId))) return true;
  res.status(403).json({ error: 'Sem acesso a este atendente.' });
  return false;
}

// Lista de conversas (última mensagem de cada contato) de um atendente
router.get('/conversas', async (req, res) => {
  try {
    const usuarioIdOriginal = String(req.query.usuarioId || '');
    if (!usuarioIdOriginal) return res.json([]);
    if (!(await permiteAtendente(req, res, usuarioIdOriginal))) return;
    // Quem COMPARTILHA WhatsApp enxerga a MESMA Caixa de Entrada do dono (as mensagens
    // são fisicamente salvas sob o ID do dono, pois só a sessão dele existe de verdade).
    const usuarioId = await resolverConexaoEfetiva(usuarioIdOriginal);

    // Última mensagem de cada chat (para a prévia).
    // Ignora mensagens de SISTEMA/ruído ("outro" vazio ou protocolMessage sem mídia),
    // que não são conversa e sujavam a prévia da Caixa de Entrada.
    const conversas: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatJid") "chatJid", "chatNome", "texto", "tipo", "fromMe", "timestamp"
      FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId}
        AND NOT (tipo = 'outro' AND ("midiaUrl" IS NULL OR "midiaUrl" = '') AND texto IN ('', 'protocolMessage'))
      ORDER BY "chatJid", "timestamp" DESC
    `;

    // Melhor NOME de cada chat = a mensagem mais recente que TEM nome preenchido
    // (resolve o caso de a última mensagem ser nossa/sem pushName, mostrando o @lid).
    const nomes: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatJid") "chatJid", "chatNome"
      FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId} AND "chatNome" <> '' AND "fromMe" = false
      ORDER BY "chatJid", "timestamp" DESC
    `;
    const mapaNomes: Record<string, string> = {};
    nomes.forEach((n: any) => { mapaNomes[n.chatJid] = n.chatNome; });

    // Melhor NÚMERO REAL de cada chat (resolvido do @lid)
    const numeros: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatJid") "chatJid", "numeroReal"
      FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId} AND "numeroReal" IS NOT NULL AND "numeroReal" <> ''
      ORDER BY "chatJid", "timestamp" DESC
    `;
    const mapaNumeros: Record<string, string> = {};
    numeros.forEach((n: any) => { mapaNumeros[n.chatJid] = n.numeroReal; });

    // ── Atribuição por ATENDENTE (número compartilhado) ──
    // A conversa "é" de quem mandou a ÚLTIMA resposta nela. Fontes (nesta ordem):
    // 1. enviadoPorId (mensagem mandada pelo painel por quem compartilha a conexão);
    // 2. assinatura "*Nome:*" que a extensão injeta nas mensagens do WhatsApp Web.
    // Sem nenhuma das duas → conversa "sem atendente" (atendenteId null).
    const ultimasRespostas: any[] = await prisma.$queryRaw`
      SELECT DISTINCT ON ("chatJid") "chatJid", "texto", "enviadoPorId"
      FROM "Mensagem"
      WHERE "usuarioId" = ${usuarioId} AND "fromMe" = true
      ORDER BY "chatJid", "timestamp" DESC
    `;
    // Assinatura pode ser de QUALQUER atendente ativo (várias pessoas atendem o mesmo
    // número via WhatsApp Web multi-aparelho, sem whatsappDonoId configurado) — então
    // o casamento nome→id usa todos os usuários ativos, não só o dono e compartilhantes.
    const equipe = await prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    const nomePorIdU: Record<string, string> = {};
    const idPorNome: Record<string, string> = {};
    equipe.forEach((u) => { nomePorIdU[u.id] = u.nome; idPorNome[u.nome.trim().toLowerCase()] = u.id; });
    // enviadoPorId pode ser alguém fora da equipe (ex.: master pelo painel) — busca o nome também.
    const idsExtras = [...new Set(ultimasRespostas.map((m: any) => m.enviadoPorId).filter((id: any) => id && !nomePorIdU[id]))] as string[];
    if (idsExtras.length) {
      const extras = await prisma.usuario.findMany({ where: { id: { in: idsExtras } }, select: { id: true, nome: true } });
      extras.forEach((u) => { nomePorIdU[u.id] = u.nome; });
    }
    const donoPorChat: Record<string, string | null> = {};
    ultimasRespostas.forEach((m: any) => {
      let id: string | null = null;
      if (m.enviadoPorId) {
        id = String(m.enviadoPorId);
      } else {
        const ass = /^\*(.+?):\*/.exec(String(m.texto || ''));
        const achado = ass && ass[1] ? idPorNome[ass[1].trim().toLowerCase()] : undefined;
        if (achado) id = achado;
      }
      donoPorChat[m.chatJid] = id;
    });

    // Nomes SALVOS nos contatos do atendente (por número real) — fonte extra de nome
    const mapaContatoNome: Record<string, string> = {};
    try {
      const salvos = await prisma.contato.findMany({ where: { usuarioId }, select: { numero: true, nome: true } });
      salvos.forEach((ct: any) => { if (ct.numero && ct.nome) mapaContatoNome[String(ct.numero).replace(/\D/g, '')] = ct.nome; });
    } catch (e) {}

    // Fallback: mapa de contatos do WhatsApp (em memória)
    let contatosNomes: Map<string, string> = new Map();
    try { contatosNomes = require('../workers/whatsappService').contatosNomes; } catch (e) {}

    conversas.forEach((c: any) => {
      const numReal = mapaNumeros[c.chatJid] || (String(c.chatJid).includes('@lid') ? '' : String(c.chatJid).split('@')[0]);
      c.numeroReal = numReal;
      // Nome: msgs recebidas (pushName) > contato salvo (por número) > contatos em memória.
      // NUNCA o nosso próprio nome.
      c.chatNome = mapaNomes[c.chatJid]
        || (numReal && mapaContatoNome[numReal.replace(/\D/g, '')] ? mapaContatoNome[numReal.replace(/\D/g, '')] : '')
        || (contatosNomes.has(c.chatJid) ? contatosNomes.get(c.chatJid) : '')
        || '';
      // Atendente responsável (última resposta atribuível)
      const atId = donoPorChat[c.chatJid] ?? null;
      c.atendenteId = atId;
      c.atendenteNome = atId ? (nomePorIdU[atId] ?? null) : null;
    });

    // Ordena por mais recente
    conversas.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filtro opcional por atendente: ?atendenteId=<id> (só as dele) ou 'sem' (não atribuídas).
    const atendenteFiltro = String(req.query.atendenteId || '');
    let lista = conversas;
    if (atendenteFiltro === 'sem') lista = conversas.filter((c: any) => !c.atendenteId);
    else if (atendenteFiltro) lista = conversas.filter((c: any) => c.atendenteId === atendenteFiltro);
    res.json(lista);
  } catch (e) {
    console.error('Erro ao buscar conversas:', e);
    res.status(500).json({ error: 'Erro ao buscar conversas' });
  }
});

// Mensagens de uma conversa específica
router.get('/mensagens', async (req, res) => {
  try {
    const usuarioIdOriginal = String(req.query.usuarioId || '');
    const jid = String(req.query.jid || '');
    if (!usuarioIdOriginal || !jid) return res.json([]);
    if (!(await permiteAtendente(req, res, usuarioIdOriginal))) return;
    const usuarioId = await resolverConexaoEfetiva(usuarioIdOriginal);

    const mensagens = await prisma.mensagem.findMany({
      where: {
        usuarioId,
        chatJid: jid,
        // Esconde o ruído de sistema ("outro" vazio/protocolMessage sem mídia)
        NOT: { tipo: 'outro', midiaUrl: null, texto: { in: ['', 'protocolMessage'] } }
      },
      orderBy: { timestamp: 'asc' },
      take: 300
    });
    res.json(mensagens);
  } catch (e) {
    console.error('Erro ao buscar mensagens:', e);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// Enviar mensagem (texto) pela Caixa de Entrada
router.post('/enviar', async (req, res) => {
  try {
    const { usuarioId, jid, texto } = req.body;
    if (!usuarioId || !jid || !texto) {
      return res.status(400).json({ error: 'usuarioId, jid e texto são obrigatórios.' });
    }
    if (!(await permiteAtendente(req, res, String(usuarioId)))) return;
    const { enviarMensagemInbox } = require('../workers/whatsappService');
    // Envia de fato pela sessão do DONO (efetivoId), mas grava enviadoPorId com o ID
    // ORIGINAL (antes de resolver) para registrar quem de fato mandou a mensagem.
    const efetivoId = await resolverConexaoEfetiva(String(usuarioId));
    const enviadoPorId = efetivoId !== String(usuarioId) ? String(usuarioId) : undefined;
    const ok = await enviarMensagemInbox(efetivoId, String(jid), String(texto), enviadoPorId);
    if (ok) res.json({ success: true });
    else res.status(503).json({ error: 'WhatsApp não está conectado ou falhou ao enviar.' });
  } catch (e) {
    console.error('Erro ao enviar (inbox):', e);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Enviar MÍDIA (foto, vídeo, áudio, documento) pela Caixa de Entrada
router.post('/enviar-midia', async (req, res) => {
  try {
    const { usuarioId, jid, base64, mimetype, tipo, legenda } = req.body;
    if (!usuarioId || !jid || !base64 || !tipo) {
      return res.status(400).json({ error: 'usuarioId, jid, base64 e tipo são obrigatórios.' });
    }
    if (!(await permiteAtendente(req, res, String(usuarioId)))) return;
    const { enviarMidiaInbox } = require('../workers/whatsappService');
    const efetivoId = await resolverConexaoEfetiva(String(usuarioId));
    const enviadoPorId = efetivoId !== String(usuarioId) ? String(usuarioId) : undefined;
    const ok = await enviarMidiaInbox(efetivoId, String(jid), String(base64), String(mimetype || ''), String(tipo), legenda ? String(legenda) : undefined, enviadoPorId);
    if (ok) res.json({ success: true });
    else res.status(503).json({ error: 'WhatsApp não conectado ou falha ao enviar mídia.' });
  } catch (e) {
    console.error('Erro ao enviar mídia (inbox):', e);
    res.status(500).json({ error: 'Erro ao enviar mídia' });
  }
});

// ── Mensagens rápidas (templates) — compartilhadas pela equipe ──
router.get('/templates', async (_req, res) => {
  try {
    const templates = await prisma.template.findMany({ orderBy: { criadoEm: 'asc' } });
    res.json(templates);
  } catch (e) {
    console.error('Erro ao buscar templates:', e);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { atalho, texto } = req.body;
    if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto é obrigatório.' });
    const t = await prisma.template.create({ data: { atalho: String(atalho || '').trim(), texto: String(texto).trim() } });
    res.status(201).json(t);
  } catch (e) {
    console.error('Erro ao criar template:', e);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.sendStatus(204);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

export default router;
