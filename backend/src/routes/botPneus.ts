import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import { prisma } from '../server';
import { enviarMensagemInbox, enviarMidiaInbox, resolverConexaoEfetiva, apagarMensagemParaTodos, editarMensagemWhatsApp, dispararRespostaBotAgora, enviarLocalizacaoManual } from '../workers/whatsappService';
import { lerBotPneusConfig, salvarBotPneusConfig } from '../services/botPneusConfig';

const router = Router();

type ReqUser = {
  sub?: string;
  role?: string;
  modulos?: string[];
};

function ehMaster(role?: string): boolean {
  return ['master', 'admin'].includes(String(role || '').toLowerCase());
}

function normalizarNumero(valor: string): string {
  return String(valor || '').replace(/\D/g, '');
}

function extrairNumeroDoJid(chatJid: string, numeroReal?: string | null): string {
  const real = normalizarNumero(numeroReal || '');
  if (real) return real;
  return normalizarNumero(String(chatJid || '').split('@')[0] || '');
}

function extrairMedida(texto: string): string {
  const match = String(texto || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .match(/\b(\d{3}\/\d{2}(?:R|\/)?\d{2})\b/);
  if (!match?.[1]) return '';
  return match[1].replace('R', '/');
}


async function usuarioIdsPermitidos(req: any): Promise<string[]> {
  const user = (req.user || {}) as ReqUser;
  if (!user.sub) return [];
  if (ehMaster(user.role)) {
    const todos = await prisma.usuario.findMany({
      where: { ativo: true, botIaAtivo: true },
      select: { id: true },
    });
    return todos.map((u) => u.id);
  }
  const eu = await prisma.usuario.findUnique({
    where: { id: String(user.sub) },
    select: { id: true, botIaAtivo: true, whatsappDonoId: true },
  });
  if (!eu) return [];

  // Se a propria conta roda o robo, mostra as conversas dela (e da conta dona, quando
  // ela compartilha o WhatsApp de outra).
  if (eu.botIaAtivo) {
    const ids = [eu.id];
    if (eu.whatsappDonoId) ids.push(eu.whatsappDonoId);
    return ids;
  }

  // Achado 01/09: quem tem o modulo do robo liberado mas NAO roda o robo (ex.: a josy,
  // que e de outra loja e so gerencia o atendimento do robo) via as conversas da
  // PROPRIA caixa de entrada aqui dentro, em vez das conversas do robo. Este modulo e
  // exclusivo do robo, e o acesso a ele ja e controlado por modulosPermitidos — entao
  // aqui devolvemos as contas que de fato rodam o robo.
  const contasComBot = await prisma.usuario.findMany({
    where: { ativo: true, botIaAtivo: true },
    select: { id: true },
  });
  return contasComBot.map((u) => u.id);
}

async function usuariosBotIds(): Promise<Set<string>> {
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, botIaAtivo: true },
    select: { id: true, whatsappDonoId: true },
  });
  const ids = new Set<string>();
  for (const u of usuarios) {
    ids.add(u.id);
    if (u.whatsappDonoId) ids.add(u.whatsappDonoId);
  }
  return ids;
}

async function validarContato(req: any, contatoId: string) {
  const [permitidos, botIds] = await Promise.all([usuarioIdsPermitidos(req), usuariosBotIds()]);
  const [usuarioId, ...jidRest] = String(contatoId || '').split('::');
  const chatJid = jidRest.join('::');
  if (!usuarioId || !chatJid) return null;
  if (!permitidos.includes(usuarioId)) return null;
  if (!botIds.has(usuarioId)) return null;
  return { usuarioId, chatJid };
}

async function contatoAtual(usuarioId: string, chatJid: string) {
  const [estado, ultimaComNumero, msgs] = await Promise.all([
    prisma.botConversa.findUnique({ where: { usuarioId_chatJid: { usuarioId, chatJid } } }),
    prisma.mensagem.findFirst({
      where: { usuarioId, chatJid },
      orderBy: { timestamp: 'desc' },
      select: { chatNome: true, numeroReal: true, texto: true, fromMe: true, timestamp: true, tipo: true },
    }),
    prisma.mensagem.findMany({
      where: { usuarioId, chatJid },
      orderBy: { timestamp: 'desc' },
      take: 30,
      select: { texto: true, fromMe: true, numeroReal: true, chatNome: true, timestamp: true },
    }),
  ]);

  const historico = [...msgs].reverse();
  const ultimaEntradaTexto = [...historico].reverse().find((m) => !m.fromMe && String(m.texto || '').trim());
  const ultimaSaidaTexto = [...historico].reverse().find((m) => m.fromMe && String(m.texto || '').trim());
  const medida = extrairMedida([
    ultimaEntradaTexto?.texto || '',
    ...historico.filter((m) => !m.fromMe).map((m) => m.texto || ''),
  ].join('\n'));
  const resumo = String(ultimaEntradaTexto?.texto || ultimaSaidaTexto?.texto || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const numero = extrairNumeroDoJid(chatJid, ultimaComNumero?.numeroReal);

  return {
    id: `${usuarioId}::${chatJid}`,
    nome: ultimaComNumero?.chatNome || numero || 'Sem nome',
    telefone: numero,
    medida,
    modeloRecomendado: '',
    viraALoja: false,
    botPausado: !!(estado?.pausadoAte && estado.pausadoAte.getTime() > Date.now()),
    pausaAte: estado?.pausadoAte?.toISOString() || null,
    resumo,
    ultimaMsgEm: ultimaComNumero?.timestamp?.toISOString() || null,
  };
}

router.get('/resumo', async (req, res) => {
  try {
    const permitidos = await usuarioIdsPermitidos(req);
    if (!permitidos.length) return res.json({ kpis: { total: 0, hoje: 0, botPausados: 0 }, contatos: [] });

    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: { in: permitidos } },
      orderBy: { timestamp: 'desc' },
      take: 4000,
      select: {
        id: true,
        usuarioId: true,
        chatJid: true,
        chatNome: true,
        fromMe: true,
        texto: true,
        tipo: true,
        numeroReal: true,
        timestamp: true,
      },
    });

    const estados = await prisma.botConversa.findMany({
      where: { usuarioId: { in: permitidos } },
      select: { usuarioId: true, chatJid: true, pausadoAte: true },
    });
    const pausas = new Map(estados.map((e) => [`${e.usuarioId}::${e.chatJid}`, e]));

    // NOME do contato (mesma cascata da Caixa de Entrada): mensagem RECEBIDA mais
    // recente que tenha pushName > contato salvo do atendente (por numero) >
    // agenda em memoria do Baileys. Achado 01/09: antes usava so o chatNome da
    // ULTIMA mensagem — quando a ultima era NOSSA, vinha vazio e a lista exibia o
    // numero cru no lugar do nome.
    const mapaNomes: Record<string, string> = {};
    for (const msg of mensagens) {
      if (msg.fromMe) continue;
      const nome = String(msg.chatNome || '').trim();
      if (!nome) continue;
      const chave = `${msg.usuarioId}::${msg.chatJid}`;
      if (!mapaNomes[chave]) mapaNomes[chave] = nome; // mensagens ja vem em ordem desc
    }

    const mapaContatoNome: Record<string, string> = {};
    try {
      const salvos = await prisma.contato.findMany({
        where: { usuarioId: { in: permitidos } },
        select: { numero: true, nome: true },
      });
      salvos.forEach((ct: any) => {
        if (ct.numero && ct.nome) mapaContatoNome[String(ct.numero).replace(/\D/g, '')] = ct.nome;
      });
    } catch (e) { /* sem contatos salvos: segue com as outras fontes */ }

    let contatosNomes: Map<string, string> = new Map();
    try { contatosNomes = require('../workers/whatsappService').contatosNomes; } catch (e) { /* opcional */ }

    // FOTO de perfil: reaproveita os avatares que a Caixa de Entrada ja espelha
    // localmente. Se ainda nao existir, agenda o download em background (sem
    // travar a resposta) — igual ao inbox.
    const avatarsDir = path.join(__dirname, '../../public/midias/avatars');
    try { fs.mkdirSync(avatarsDir, { recursive: true }); } catch (e) { /* ja existe */ }
    const pendentesFoto: Array<{ usuarioId: string; chatJid: string }> = [];

    const agrupado = new Map<string, any[]>();
    for (const msg of mensagens) {
      const key = `${msg.usuarioId}::${msg.chatJid}`;
      if (!agrupado.has(key)) agrupado.set(key, []);
      agrupado.get(key)!.push(msg);
    }

    const contatos = Array.from(agrupado.entries()).map(([key, itens]) => {
      const [usuarioId, ...jidRest] = key.split('::');
      const chatJid = jidRest.join('::');
      const ordenadas = [...itens].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
      const ultima = ordenadas[ordenadas.length - 1];
      const ultimaEntrada = [...ordenadas].reverse().find((m) => !m.fromMe && String(m.texto || '').trim());
      const numero = extrairNumeroDoJid(chatJid, ultima?.numeroReal);
      const medida = extrairMedida(ordenadas.filter((m) => !m.fromMe).map((m) => m.texto || '').join('\n'));
      const estado = pausas.get(key);
      const botPausado = !!(estado?.pausadoAte && estado.pausadoAte.getTime() > Date.now());
      const numeroLimpo = String(numero || '').replace(/\D/g, '');
      const nomeResolvido =
        mapaNomes[key]
        || (numeroLimpo && mapaContatoNome[numeroLimpo] ? mapaContatoNome[numeroLimpo] : '')
        || (contatosNomes.has(chatJid) ? String(contatosNomes.get(chatJid) || '') : '')
        || String(ultima?.chatNome || '').trim();

      const cleanJid = String(chatJid || '').replace(/[^a-zA-Z0-9]/g, '_');
      const arqFoto = path.join(avatarsDir, `${cleanJid}.jpg`);
      let fotoUrl: string | null = null;
      if (fs.existsSync(arqFoto)) {
        fotoUrl = `/midias/avatars/${cleanJid}.jpg`;
      } else if (pendentesFoto.length < 60) {
        pendentesFoto.push({ usuarioId: String(usuarioId || ''), chatJid });
      }

      return {
        id: key,
        nome: nomeResolvido || numero || 'Sem nome',
        fotoUrl,
        telefone: numero,
        medida,
        modeloRecomendado: '',
        viraALoja: false,
        botPausado,
        pausaAte: estado?.pausadoAte?.toISOString() || null,
        resumo: String(ultimaEntrada?.texto || ultima?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        ultimaMsgEm: ultima?.timestamp?.toISOString() || null,
        ultimaMensagem: {
          direcao: ultima?.fromMe ? 'SAIDA' : 'ENTRADA',
          texto: ultima?.texto || (ultima?.tipo === 'imagem' ? '[imagem]' : ultima?.tipo === 'audio' ? '[audio]' : ''),
        },
      };
    }).sort((a, b) => +new Date(b.ultimaMsgEm || 0) - +new Date(a.ultimaMsgEm || 0));

    // Puxa em background as fotos que ainda nao estao espelhadas (nao bloqueia a resposta).
    if (pendentesFoto.length > 0) {
      try {
        const { baixarFotoPerfilLocal } = require('../workers/whatsappService');
        pendentesFoto.forEach((item, idx) => {
          setTimeout(() => {
            baixarFotoPerfilLocal(item.usuarioId, item.chatJid).catch(() => {});
          }, idx * 250).unref?.();
        });
      } catch (e) { /* worker indisponivel: a lista funciona sem foto */ }
    }

    const hojeIso = new Date().toISOString().slice(0, 10);
    const kpis = {
      total: contatos.length,
      hoje: contatos.filter((c) => String(c.ultimaMsgEm || '').slice(0, 10) === hojeIso).length,
      botPausados: contatos.filter((c) => c.botPausado).length,
    };

    res.json({ kpis, contatos });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao montar resumo do Bot Pneus.' });
  }
});

router.get('/conversa/:id', async (req, res) => {
  try {
    const alvo = await validarContato(req, req.params.id);
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a esta conversa.' });

    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid },
      orderBy: { timestamp: 'asc' },
      take: 400,
    });

    res.json({
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: m.fromMe ? 'SAIDA' : 'ENTRADA',
        waId: m.waId,
        tipo: m.tipo,
        conteudo: m.texto || (m.tipo === 'imagem' ? '[imagem]' : m.tipo === 'audio' ? '[audio]' : ''),
        // Achado 04/09: toda mensagem fromMe que NAO era do robo virava "ATENDENTE" no
        // painel — inclusive as que tem enviadoPorId NULO (nem robo, nem ninguem logado no
        // painel; ex.: mensagens tipo "ja conectei voce com nossa equipe" que aparecem
        // nesse numero sem passar pelo nosso sistema). Isso enganava quem le a conversa,
        // fazendo mensagem de ORIGEM DESCONHECIDA parecer que foi um atendente de verdade.
        // Agora so vira "ATENDENTE" quando realmente tem um usuario do painel por tras.
        autor: m.fromMe ? (m.enviadoPorId === 'bot' ? '🤖 Robô' : m.enviadoPorId ? 'ATENDENTE' : '❓ Origem não identificada') : 'CLIENTE',
        criadoEm: m.timestamp.toISOString(),
        temMidia: !!m.midiaUrl,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar conversa.' });
  }
});

router.get('/agendamentos/:id', async (req, res) => {
  try {
    const alvo = await validarContato(req, req.params.id);
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a este contato.' });
    const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
    const numero = normalizarNumero(contato.telefone);

    const agendamentos = await prisma.agendamento.findMany({
      where: {
        criadoPorId: alvo.usuarioId,
        numero,
      },
      orderBy: { enviarEm: 'asc' },
      take: 50,
    });

    res.json({
      agendamentos: agendamentos.map((a) => ({
        id: a.id,
        mensagem: a.mensagem,
        enviarEm: a.enviarEm.toISOString(),
        status: a.status,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar agendamentos.' });
  }
});

router.get('/config', async (_req, res) => {
  res.json({ config: lerBotPneusConfig() });
});

router.get('/midia/:id', async (req, res) => {
  try {
    const permitidos = await usuarioIdsPermitidos(req);
    if (!permitidos.length) return res.status(403).json({ error: 'Sem acesso.' });

    const msg = await prisma.mensagem.findFirst({
      where: { id: req.params.id, usuarioId: { in: permitidos } },
      select: { midiaUrl: true, tipo: true },
    });
    if (!msg?.midiaUrl) return res.status(404).json({ error: 'Mídia indisponível.' });

    const raiz = path.resolve(__dirname, '../../public');
    const arquivo = path.resolve(raiz, String(msg.midiaUrl).replace(/^[/\\]+/, ''));
    if (!arquivo.startsWith(raiz + path.sep) || !fs.existsSync(arquivo)) {
      return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(arquivo).toLowerCase();
    const mime = msg.tipo === 'audio'
      ? (ext === '.mp3' ? 'audio/mpeg' : ext === '.ogg' ? 'audio/ogg' : 'audio/webm')
      : (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(arquivo).pipe(res);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao carregar mídia.' });
  }
});

router.post('/acao', async (req, res) => {
  try {
    const action = String(req.body?.action || '');

    if (action === 'salvarConfig') {
      const config = salvarBotPneusConfig(req.body?.config || {});
      return res.json({ ok: true, config });
    }

    if (action === 'cancelarAgendamento') {
      const id = String(req.body?.id || '');
      if (!id) return res.status(400).json({ error: 'Agendamento inválido.' });
      await prisma.agendamento.update({
        where: { id },
        data: { status: 'cancelado' },
      });
      return res.json({ ok: true });
    }

    const alvo = await validarContato(req, String(req.body?.contatoId || ''));
    if (!alvo) return res.status(403).json({ error: 'Sem acesso a este contato.' });

    if (action === 'pausar') {
      const modo = String(req.body?.modo || '').toLowerCase();
      let pausadoAte: Date | null = null;
      if (modo === '1h') pausadoAte = new Date(Date.now() + 60 * 60 * 1000);
      else if (modo === '4h') pausadoAte = new Date(Date.now() + 4 * 60 * 60 * 1000);
      else if (modo === 'manual') pausadoAte = new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000);
      else if (modo === 'reativar') pausadoAte = null;

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid, pausadoAte, motivoPausa: pausadoAte ? 'atendimento_manual' : null },
        update: { pausadoAte, motivoPausa: pausadoAte ? 'atendimento_manual' : null },
      });
      const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
      return res.json({ ok: true, contato });
    }

    // Faz o ROBO responder esta conversa agora, sob demanda. Util quando a conversa
    // ficou sem resposta (ex.: o robo estava pausado por engano) — em vez de o humano
    // digitar, o proprio robo assume de novo, usando o mesmo fluxo de sempre.
    if (action === 'responderAgora') {
      // Tira qualquer pausa que esteja segurando o robo nessa conversa.
      await prisma.botConversa.updateMany({
        where: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid },
        data: { pausadoAte: null, motivoPausa: null },
      });
      const ok = await dispararRespostaBotAgora(alvo.usuarioId, alvo.chatJid);
      if (!ok) return res.status(503).json({ error: 'Nao foi possivel acionar o robo (WhatsApp desconectado ou sem mensagem do cliente).' });
      return res.json({ ok: true });
    }

    // Apagar PARA TODOS, igual no WhatsApp. Some do aparelho do cliente tambem.
    // Editar mensagem ja enviada, igual no WhatsApp.
    if (action === 'editar') {
      const mensagemId = String(req.body?.mensagemId || '');
      const textoNovo = String(req.body?.texto || '').trim();
      if (!mensagemId) return res.status(400).json({ error: 'Mensagem invalida.' });
      if (!textoNovo) return res.status(400).json({ error: 'O texto novo nao pode ficar vazio.' });
      const msg = await prisma.mensagem.findUnique({
        where: { id: mensagemId },
        select: { id: true, waId: true, fromMe: true, usuarioId: true, chatJid: true, tipo: true, timestamp: true },
      });
      if (!msg || msg.usuarioId !== alvo.usuarioId || msg.chatJid !== alvo.chatJid) {
        return res.status(404).json({ error: 'Mensagem nao encontrada nesta conversa.' });
      }
      if (!msg.fromMe) {
        return res.status(400).json({ error: 'So da pra editar as mensagens que a loja enviou.' });
      }
      if (msg.tipo !== 'texto') {
        return res.status(400).json({ error: 'O WhatsApp so permite editar mensagem de texto.' });
      }
      if (!msg.waId) {
        return res.status(400).json({ error: 'Essa mensagem nao tem identificador do WhatsApp — nao da pra editar la.' });
      }
      // O WhatsApp so aceita edicao ate ~15 min. Avisa antes de tentar, pra dar um
      // erro que a pessoa entende em vez de uma falha seca do WhatsApp.
      const minutos = (Date.now() - msg.timestamp.getTime()) / 60000;
      if (minutos > 15) {
        return res.status(400).json({ error: 'O WhatsApp so deixa editar ate 15 minutos depois do envio. Essa ja passou do prazo.' });
      }
      const ok = await editarMensagemWhatsApp(alvo.usuarioId, alvo.chatJid, msg.waId, textoNovo);
      if (!ok) return res.status(503).json({ error: 'Nao consegui editar no WhatsApp (sem conexao ou o WhatsApp recusou).' });
      // So atualiza o painel depois que o WhatsApp confirmou, pra tela nao mentir.
      await prisma.mensagem.update({ where: { id: msg.id }, data: { texto: textoNovo } }).catch(() => {});
      return res.json({ ok: true, texto: textoNovo });
    }

    if (action === 'apagar') {
      const mensagemId = String(req.body?.mensagemId || '');
      if (!mensagemId) return res.status(400).json({ error: 'Mensagem invalida.' });
      const msg = await prisma.mensagem.findUnique({
        where: { id: mensagemId },
        select: { id: true, waId: true, fromMe: true, usuarioId: true, chatJid: true },
      });
      if (!msg || msg.usuarioId !== alvo.usuarioId || msg.chatJid !== alvo.chatJid) {
        return res.status(404).json({ error: 'Mensagem nao encontrada nesta conversa.' });
      }
      // O WhatsApp NAO permite apagar no aparelho do cliente uma mensagem que ELE
      // mandou — isso e limite da plataforma, nao do sistema. Entao, pra mensagem do
      // cliente, a gente tira so do painel e avisa o que aconteceu de verdade, sem
      // dar a entender que sumiu do celular dele.
      const somenteDoPainel = !msg.fromMe;

      if (!somenteDoPainel) {
        if (!msg.waId) {
          return res.status(400).json({ error: 'Essa mensagem nao tem identificador do WhatsApp — nao da pra apagar la.' });
        }
        const ok = await apagarMensagemParaTodos(alvo.usuarioId, alvo.chatJid, msg.waId, true);
        if (!ok) return res.status(503).json({ error: 'Nao consegui apagar no WhatsApp (sem conexao ou fora do prazo que o WhatsApp permite).' });
      }

      // So sai do painel depois que o WhatsApp confirmou, pra tela nao mentir.
      await prisma.mensagem.delete({ where: { id: msg.id } }).catch(() => {});
      return res.json({ ok: true, somenteDoPainel });
    }

    // Manda a localizacao da loja pro cliente (pino nativo + link + foto se houver).
    if (action === 'enviarLocalizacao') {
      const ok = await enviarLocalizacaoManual(alvo.usuarioId, alvo.chatJid);
      if (!ok) return res.status(503).json({ error: 'Nao consegui enviar a localizacao (sem conexao ou coordenadas nao configuradas).' });
      return res.json({ ok: true });
    }

    if (action === 'enviar') {
      const mensagem = String(req.body?.mensagem || '').trim();
      if (!mensagem) return res.status(400).json({ error: 'Mensagem vazia.' });
      const efetivoId = await resolverConexaoEfetiva(alvo.usuarioId);
      const ok = await enviarMensagemInbox(efetivoId, alvo.chatJid, mensagem, alvo.usuarioId);
      if (!ok) return res.status(503).json({ error: 'WhatsApp não conectado para este bot.' });

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: {
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
      });
      return res.json({ ok: true });
    }

    if (action === 'enviarMidia') {
      const tipo = String(req.body?.tipo || '');
      const base64 = String(req.body?.b64 || '');
      const mime = String(req.body?.mime || '');
      if (!tipo || !base64) return res.status(400).json({ error: 'Mídia inválida.' });
      const efetivoId = await resolverConexaoEfetiva(alvo.usuarioId);
      const ok = await enviarMidiaInbox(efetivoId, alvo.chatJid, base64, mime, tipo, undefined, alvo.usuarioId);
      if (!ok) return res.status(503).json({ error: 'WhatsApp não conectado para envio de mídia.' });

      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: alvo.usuarioId, chatJid: alvo.chatJid } },
        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: {
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
      });
      return res.json({ ok: true });
    }

    if (action === 'agendar') {
      const contato = await contatoAtual(alvo.usuarioId, alvo.chatJid);
      const numero = normalizarNumero(contato.telefone);
      const mensagem = String(req.body?.mensagem || '').trim();
      const enviarEm = new Date(String(req.body?.enviarEm || ''));
      if (!mensagem || !numero || Number.isNaN(+enviarEm)) {
        return res.status(400).json({ error: 'Dados do agendamento inválidos.' });
      }

      const agendamento = await prisma.agendamento.create({
        data: {
          cliente: contato.nome || numero,
          numero,
          mensagem,
          enviarEm,
          criadoPorId: alvo.usuarioId,
          status: 'pendente',
        },
      });
      return res.json({
        ok: true,
        agendamento: {
          id: agendamento.id,
          mensagem: agendamento.mensagem,
          enviarEm: agendamento.enviarEm.toISOString(),
          status: agendamento.status,
        },
      });
    }

    return res.status(400).json({ error: 'Ação não suportada.' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro ao executar ação no Bot Pneus.' });
  }
});

export default router;
