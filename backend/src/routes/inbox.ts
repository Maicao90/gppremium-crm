import { Router } from 'express';
import { prisma } from '../server';
import { resolverConexaoEfetiva } from '../workers/whatsappService';
import { ehEscopado, idsAtendentesDaLoja } from '../auth/escopoLoja';

const router = Router();

// Quem de fato deve assinar a mensagem: por padrão é o atendente selecionado no seletor
// da Caixa de Entrada (usuarioId), só diferente do dono da conexão (efetivoId) quando ele
// está numa caixa COMPARTILHADA (comportamento antigo, vale pra admin/operador). EXCEÇÃO
// pedida pelo dono do CRM: se quem está LOGADO DE VERDADE (req.user, não o selecionado no
// dropdown) é um GERENTE, a assinatura vai com o nome dele — mesmo vendo o WhatsApp/chat
// de outro atendente da loja. Admin/master e operador continuam como antes.
async function resolverEnviadoPorId(req: any, usuarioId: string, efetivoId: string): Promise<string | undefined> {
  let enviadoPorId = efetivoId !== usuarioId ? usuarioId : undefined;
  const logadoId = req.user?.sub ? String(req.user.sub) : '';
  if (logadoId && logadoId !== efetivoId) {
    try {
      const logado = await prisma.usuario.findUnique({ where: { id: logadoId }, select: { role: true } });
      if (logado?.role === 'gerente') enviadoPorId = logadoId;
    } catch { /* noop — mantém o comportamento padrão se a checagem falhar */ }
  }
  return enviadoPorId;
}

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

    // Normaliza nome pra comparar: minúsculo + sem acento. "José" e "jose" (apelido sem
    // acento que a pessoa digita na assinatura) precisam bater com o mesmo cadastro.
    const normalizarNome = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // ── Atribuição por ATENDENTE (número compartilhado) ──
    // A conversa "é" de quem mandou a resposta atribuível mais recente nela. Fontes
    // (nesta ordem): 1. enviadoPorId (mensagem mandada pelo painel por quem compartilha
    // a conexão); 2. assinatura no início da mensagem — "*Nome:*" (injetada pela
    // extensão) OU "*Nome*" sem dois-pontos (alguns atendentes digitam/usam template
    // próprio nesse formato — ex.: "*Alan machado*\nBoa tarde!..."). Sem nenhuma das
    // duas em NENHUMA das últimas mensagens → "sem atendente" (atendenteId null).
    // Olha as últimas N mensagens NOSSAS de cada chat (não só a literal última) — uma
    // localização, figurinha ou mídia sem legenda não carrega assinatura nem
    // enviadoPorId, e se ela for a msg mais recente da conversa, "escondia" quem
    // realmente atendeu (bug real: atendente respondeu com assinatura e, logo em
    // seguida, mandou a localização da loja → a conversa caía como "Sem atendente"
    // mesmo tendo sido atendida).
    const JANELA_ATRIBUICAO = 15;
    const ultimasRespostas: any[] = await prisma.$queryRaw`
      SELECT "chatJid", "texto", "enviadoPorId" FROM (
        SELECT "chatJid", "texto", "enviadoPorId", "timestamp",
               ROW_NUMBER() OVER (PARTITION BY "chatJid" ORDER BY "timestamp" DESC) AS rn
        FROM "Mensagem"
        WHERE "usuarioId" = ${usuarioId} AND "fromMe" = true
      ) t
      WHERE rn <= ${JANELA_ATRIBUICAO}
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
    // A extensão deixa o atendente PERSONALIZAR a assinatura (ex.: só o primeiro nome,
    // "Camila" em vez de "Camila Louseiro" do cadastro) — então casa também pelo
    // primeiro nome, e só quando ele for ÚNICO entre os ativos (evita confundir duas
    // pessoas com o mesmo primeiro nome).
    const idPorPrimeiroNome: Record<string, string | null> = {};
    equipe.forEach((u) => {
      nomePorIdU[u.id] = u.nome;
      const nomeCompleto = normalizarNome(u.nome);
      idPorNome[nomeCompleto] = u.id;
      const primeiro = nomeCompleto.split(/\s+/)[0];
      if (primeiro) idPorPrimeiroNome[primeiro] = primeiro in idPorPrimeiroNome ? null : u.id;
    });
    // enviadoPorId pode ser alguém fora da equipe (ex.: master pelo painel) — busca o nome também.
    const idsExtras = [...new Set(ultimasRespostas.map((m: any) => m.enviadoPorId).filter((id: any) => id && !nomePorIdU[id]))] as string[];
    if (idsExtras.length) {
      const extras = await prisma.usuario.findMany({ where: { id: { in: idsExtras } }, select: { id: true, nome: true } });
      extras.forEach((u) => { nomePorIdU[u.id] = u.nome; });
    }
    // As linhas já vêm ordenadas por chat + mais recente primeiro (rn=1 primeiro):
    // pega a PRIMEIRA atribuível de cada chat e ignora as mensagens seguintes dele
    // (mais antigas) — não sobrescreve com uma atribuição mais velha.
    const donoPorChat: Record<string, string | null> = {};
    ultimasRespostas.forEach((m: any) => {
      if (donoPorChat[m.chatJid] !== undefined) return; // já achou a mais recente atribuível deste chat
      let id: string | null = null;
      if (m.enviadoPorId) {
        id = String(m.enviadoPorId);
      } else {
        const textoNorm = normalizarNome(String(m.texto || ''));
        // 1) Assinatura no início: "*Nome:*" ou "*Nome*".
        const ass = /^\*(.+?):?\*/.exec(String(m.texto || ''));
        const assNome = ass && ass[1] ? normalizarNome(ass[1]) : '';
        let achado = assNome ? (idPorNome[assNome] ?? idPorPrimeiroNome[assNome] ?? undefined) : undefined;
        // 2) Sem assinatura, mas o atendente se apresentou NO TEXTO: "me chamo Alan",
        //    "meu nome é Camila", "aqui é o Alan", "sou o/a Camila"… Casa o primeiro
        //    nome citado com um atendente ativo (só se o primeiro nome for único).
        //    Seguro: essa varredura só roda em mensagens NOSSAS (fromMe=true).
        if (!achado) {
          const apres = /(?:me chamo|meu nome e|aqui quem fala e|aqui e|falo com voce|sou o|sou a|sou)\s+([a-z]+)/.exec(textoNorm);
          const cand = apres && apres[1] ? apres[1] : '';
          if (cand && idPorPrimeiroNome[cand]) achado = idPorPrimeiroNome[cand] as string;
        }
        if (achado) id = achado;
      }
      if (id) donoPorChat[m.chatJid] = id;
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

// Clientes conversados por dia: só conta quando houve mensagem recebida E resposta da
// equipe no mesmo dia. Contatos internos, fornecedores de peças, grupos e mensagens de
// sistema ficam fora. Como a consulta parte do histórico, a correção vale retroativamente.
router.get('/metricas-diarias', async (req, res) => {
  try {
    const usuarioIdOriginal = String(req.query.usuarioId || '');
    if (!usuarioIdOriginal) return res.json([]);
    if (!(await permiteAtendente(req, res, usuarioIdOriginal))) return;
    const usuarioId = await resolverConexaoEfetiva(usuarioIdOriginal);
    const dias = Math.max(1, Math.min(180, Number(req.query.dias) || 30));
    // Recorte pelos últimos N dias no fuso local. Danúbia e Charles são contatos internos
    // conhecidos desta operação; os números reais evitam depender do nome salvo no WhatsApp.
    const linhas: any[] = await prisma.$queryRaw`
      WITH mensagens_validas AS (
        SELECT "chatJid", "fromMe", "timestamp", "chatNome", "numeroReal",
               date_trunc('day', ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) AS dia
        FROM "Mensagem"
        WHERE "usuarioId" = ${usuarioId}
          AND ("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') >= (now() AT TIME ZONE 'America/Sao_Paulo') - (${dias} || ' days')::interval
          AND "chatJid" NOT LIKE '%@g.us'
          AND "chatJid" NOT LIKE '%@broadcast'
          AND NOT ("tipo" = 'outro' AND ("midiaUrl" IS NULL OR "midiaUrl" = '') AND "texto" IN ('', 'protocolMessage'))
      ),
      conversas AS (
        SELECT "chatJid", dia,
               BOOL_OR("fromMe" = false) AS recebeu,
               BOOL_OR("fromMe" = true) AS respondeu
        FROM mensagens_validas
        GROUP BY "chatJid", dia
      ),
      nomes AS (
        SELECT DISTINCT ON ("chatJid") "chatJid", "chatNome"
        FROM mensagens_validas
        WHERE "chatNome" <> ''
        ORDER BY "chatJid", "timestamp" DESC
      ),
      numeros AS (
        SELECT DISTINCT ON ("chatJid") "chatJid", regexp_replace(COALESCE("numeroReal", ''), '\D', '', 'g') AS numero
        FROM mensagens_validas
        WHERE "numeroReal" IS NOT NULL AND "numeroReal" <> ''
        ORDER BY "chatJid", "timestamp" DESC
      ),
      clientes_reais AS (
        SELECT c.dia, c."chatJid", c.respondeu AS respondido
        FROM conversas c
        LEFT JOIN nomes n ON n."chatJid" = c."chatJid"
        LEFT JOIN numeros nr ON nr."chatJid" = c."chatJid"
        WHERE c.recebeu
          AND c."chatJid" NOT IN ('162474519199930@lid', '125095301365845@lid')
          AND COALESCE(nr.numero, '') NOT IN ('556196233237', '556199241570')
          AND LOWER(COALESCE(n."chatNome", '')) !~ '(auto[ -]?pe[cç]as|loja.*pe[cç]as|casa.*pe[cç]as|distribuidora.*pe[cç]as|auto mec[aâ]nica|mec[aâ]nica automotiva)'
      )
      SELECT to_char(dia, 'YYYY-MM-DD') AS dia,
             COUNT(*)::int AS contatos,
             COUNT(*) FILTER (WHERE respondido)::int AS respondidos
      FROM clientes_reais
      GROUP BY dia
      ORDER BY dia DESC
    `;
    res.json(linhas);
  } catch (e) {
    console.error('Erro nas métricas diárias:', e);
    res.status(500).json({ error: 'Erro ao calcular métricas.' });
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

    // Busca as MAIS RECENTES (desc + take) e inverte pra ordem de exibição (asc).
    // Bug antigo: orderBy asc + take trazia as 300 mais ANTIGAS, fixas pra sempre —
    // numa conversa com mais de 300 mensagens, as novas nunca apareciam (janela
    // congelada no passado, nunca deslizava).
    const recentes = await prisma.mensagem.findMany({
      where: {
        usuarioId,
        chatJid: jid,
        // Esconde o ruído de sistema ("outro" vazio/protocolMessage sem mídia)
        NOT: { tipo: 'outro', midiaUrl: null, texto: { in: ['', 'protocolMessage'] } }
      },
      orderBy: { timestamp: 'desc' },
      take: 300
    });
    res.json(recentes.reverse());
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
    // Envia de fato pela sessão do DONO (efetivoId), mas grava enviadoPorId com o ID de
    // quem deve ASSINAR a mensagem (ver resolverEnviadoPorId).
    const efetivoId = await resolverConexaoEfetiva(String(usuarioId));
    const enviadoPorId = await resolverEnviadoPorId(req, String(usuarioId), efetivoId);
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
    const enviadoPorId = await resolverEnviadoPorId(req, String(usuarioId), efetivoId);
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
