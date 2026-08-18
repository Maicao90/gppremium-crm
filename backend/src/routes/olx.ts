import { Router } from 'express';
import { prisma } from '../server';
import { requireAuth } from '../middlewares/requireAuth';
import { verificarIntegridadeAnuncio, sincronizarChatOlx, enviarMensagemOlx } from '../workers/olxWorker';

const router = Router();

// ── Resumo Geral de Métricas OLX ──
router.get('/resumo', requireAuth, async (req: any, res) => {
  try {
    const lojaId = req.query.lojaId ? String(req.query.lojaId) : undefined;
    const filtroLoja = lojaId ? { lojaId } : {};

    const [total, ativos, removidos, expirados, conversas, naoLidas] = await Promise.all([
      prisma.olxAnuncio.count({ where: filtroLoja }),
      prisma.olxAnuncio.count({ where: { ...filtroLoja, status: 'ativo' } }),
      prisma.olxAnuncio.count({ where: { ...filtroLoja, status: 'removido' } }),
      prisma.olxAnuncio.count({ where: { ...filtroLoja, status: 'expirado' } }),
      prisma.olxConversa.count(),
      prisma.olxConversa.aggregate({ _sum: { naoLidas: true } }),
    ]);

    res.json({
      total,
      ativos,
      removidos,
      expirados,
      conversas,
      naoLidasTotal: naoLidas._sum.naoLidas || 0,
    });
  } catch (e: any) {
    console.error('Erro no resumo OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao carregar resumo da OLX' });
  }
});

// ── Lista de Anúncios com Filtro e Busca ──
router.get('/anuncios', requireAuth, async (req: any, res) => {
  try {
    const { lojaId, status, busca } = req.query;
    const where: any = {};

    if (lojaId && lojaId !== '__todas__') where.lojaId = String(lojaId);
    if (status && status !== 'todos') where.status = String(status);
    if (busca) {
      where.OR = [
        { titulo: { contains: String(busca), mode: 'insensitive' } },
        { descricao: { contains: String(busca), mode: 'insensitive' } },
        { olxAdId: { contains: String(busca), mode: 'insensitive' } },
      ];
    }

    const anuncios = await prisma.olxAnuncio.findMany({
      where,
      orderBy: { atualizadoEm: 'desc' },
      include: {
        conta: { select: { id: true, nome: true, email: true } },
      },
    });

    // Mapeia nomes das lojas para exibição facilitada
    const lojas = await prisma.loja.findMany({ select: { id: true, store_name: true } });
    const mapaLojas: Record<string, string> = {};
    lojas.forEach((l) => { mapaLojas[l.id] = l.store_name; });

    const lista = anuncios.map((a) => ({
      ...a,
      lojaNome: a.lojaId ? (mapaLojas[a.lojaId] || 'Loja Desconhecida') : 'Sem Loja',
      fotosList: (() => {
        try { return JSON.parse(a.fotos || '[]'); } catch { return []; }
      })(),
    }));

    res.json(lista);
  } catch (e: any) {
    console.error('Erro ao buscar anúncios OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao listar anúncios' });
  }
});

// ── Criar e Publicar Anúncio Direto ──
router.post('/anuncios', requireAuth, async (req: any, res) => {
  try {
    const {
      titulo,
      descricao,
      preco,
      categoria,
      tipoItem,
      fotos,
      cep,
      telefone,
      lojaId,
      contaId,
      linkOlx,
    } = req.body;

    if (!titulo || !preco) {
      return res.status(400).json({ error: 'Título e Preço são obrigatórios.' });
    }

    const fotosStr = Array.isArray(fotos) ? JSON.stringify(fotos) : (typeof fotos === 'string' ? fotos : '[]');

    // Gera link ou código identificador caso seja publicação assistida
    const randomAdId = `OLX-${Math.floor(100000000 + Math.random() * 900000000)}`;
    const linkFinal = linkOlx || `https://df.olx.com.br/autos-e-pecas/pecas-e-acessorios/${randomAdId}`;

    const novo = await prisma.olxAnuncio.create({
      data: {
        titulo: String(titulo).trim(),
        descricao: String(descricao || '').trim(),
        preco: Number(preco) || 0,
        categoria: String(categoria || 'pneus_rodas'),
        tipoItem: String(tipoItem || 'novo'),
        fotos: fotosStr,
        cep: String(cep || '70000-000').trim(),
        telefone: String(telefone || '').replace(/\D/g, ''),
        lojaId: lojaId ? String(lojaId) : null,
        contaId: contaId ? String(contaId) : null,
        olxAdId: randomAdId,
        linkOlx: linkFinal,
        status: 'ativo',
        publicadoEm: new Date(),
        ultimaChecagem: new Date(),
      },
    });

    res.status(201).json(novo);
  } catch (e: any) {
    console.error('Erro ao criar anúncio OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao criar anúncio' });
  }
});

// ── Editar Anúncio ──
router.put('/anuncios/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const {
      titulo,
      descricao,
      preco,
      categoria,
      tipoItem,
      fotos,
      cep,
      telefone,
      lojaId,
      linkOlx,
      status,
    } = req.body;

    const data: any = {};
    if (titulo !== undefined) data.titulo = String(titulo).trim();
    if (descricao !== undefined) data.descricao = String(descricao).trim();
    if (preco !== undefined) data.preco = Number(preco);
    if (categoria !== undefined) data.categoria = String(categoria);
    if (tipoItem !== undefined) data.tipoItem = String(tipoItem);
    if (fotos !== undefined) data.fotos = Array.isArray(fotos) ? JSON.stringify(fotos) : String(fotos);
    if (cep !== undefined) data.cep = String(cep);
    if (telefone !== undefined) data.telefone = String(telefone);
    if (lojaId !== undefined) data.lojaId = lojaId ? String(lojaId) : null;
    if (linkOlx !== undefined) data.linkOlx = String(linkOlx);
    if (status !== undefined) data.status = String(status);

    const atualizado = await prisma.olxAnuncio.update({
      where: { id },
      data,
    });

    res.json(atualizado);
  } catch (e: any) {
    console.error('Erro ao atualizar anúncio OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao atualizar anúncio' });
  }
});

// ── Republicar / Reativar Anúncio Removido ou Expirado (1 Clique) ──
router.post('/anuncios/:id/republicar', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const anuncio = await prisma.olxAnuncio.findUnique({ where: { id } });

    if (!anuncio) {
      return res.status(404).json({ error: 'Anúncio não encontrado.' });
    }

    const reativado = await prisma.olxAnuncio.update({
      where: { id },
      data: {
        status: 'ativo',
        motivoRemocao: null,
        publicadoEm: new Date(),
        ultimaChecagem: new Date(),
      },
    });

    res.json({ success: true, anuncio: reativado });
  } catch (e: any) {
    console.error('Erro ao republicar anúncio:', e);
    res.status(500).json({ error: e.message || 'Erro ao republicar anúncio' });
  }
});

// ── Verificar Status Individual Imediato ──
router.post('/anuncios/:id/verificar-status', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const resultado = await verificarIntegridadeAnuncio(id);
    res.json(resultado);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao verificar status' });
  }
});

// ── Excluir Anúncio ──
router.delete('/anuncios/:id', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    await prisma.olxAnuncio.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Erro ao excluir anúncio' });
  }
});

// ── Conversas do Chat OLX ──
router.get('/conversas', requireAuth, async (req: any, res) => {
  try {
    const { lojaId, anuncioId } = req.query;
    const where: any = {};

    if (anuncioId) where.anuncioId = String(anuncioId);
    if (lojaId && lojaId !== '__todas__') {
      where.anuncio = { lojaId: String(lojaId) };
    }

    const conversas = await prisma.olxConversa.findMany({
      where,
      orderBy: { ultimaMsgData: 'desc' },
      include: {
        anuncio: {
          select: { id: true, titulo: true, preco: true, fotos: true, lojaId: true, linkOlx: true },
        },
      },
    });

    const lista = conversas.map((c) => {
      let fotoPrincipal = null;
      try {
        const f = JSON.parse(c.anuncio?.fotos || '[]');
        if (f.length > 0) fotoPrincipal = f[0];
      } catch {}
      return {
        ...c,
        anuncioFoto: fotoPrincipal,
        anuncioTitulo: c.anuncio?.titulo || 'Anúncio na OLX',
        anuncioPreco: c.anuncio?.preco || 0,
      };
    });

    res.json(lista);
  } catch (e: any) {
    console.error('Erro ao buscar conversas OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao buscar conversas' });
  }
});

// ── Mensagens de uma Conversa OLX ──
router.get('/conversas/:id/mensagens', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const mensagens = await prisma.olxMensagem.findMany({
      where: { conversaId: id },
      orderBy: { timestamp: 'asc' },
    });

    // Zera contador de não lidas ao abrir a conversa
    await prisma.olxConversa.update({
      where: { id },
      data: { naoLidas: 0 },
    }).catch(() => {});

    res.json(mensagens);
  } catch (e: any) {
    console.error('Erro ao buscar mensagens OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao buscar mensagens' });
  }
});

// ── Responder Comprador pelo Chat OLX ──
router.post('/conversas/:id/enviar', requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    const atendenteId = req.user?.sub || null;

    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ error: 'Texto da mensagem é obrigatório.' });
    }

    const conversa = await prisma.olxConversa.findUnique({ where: { id } });
    if (!conversa) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    // 1. Salva no banco de dados local
    const novaMsg = await prisma.olxMensagem.create({
      data: {
        conversaId: id,
        fromMe: true,
        texto: String(texto).trim(),
        enviadoPorId: atendenteId ? String(atendenteId) : null,
      },
    });

    // 2. Atualiza a conversa
    await prisma.olxConversa.update({
      where: { id },
      data: {
        ultimaMsg: String(texto).trim(),
        ultimaMsgData: new Date(),
        atendenteId: atendenteId ? String(atendenteId) : null,
      },
    });

    // 3. Dispara envio para a API da OLX via Worker
    await enviarMensagemOlx(conversa.olxChatId || id, String(texto).trim()).catch(() => {});

    res.json({ success: true, mensagem: novaMsg });
  } catch (e: any) {
    console.error('Erro ao enviar mensagem OLX:', e);
    res.status(500).json({ error: e.message || 'Erro ao enviar mensagem' });
  }
});

// ── Contas e Credenciais da OLX ──
router.get('/contas', requireAuth, async (_req, res) => {
  try {
    const contas = await prisma.olxConta.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        lojaId: true,
        statusConexao: true,
        ultimoErro: true,
        criadoEm: true,
        _count: { select: { anuncios: true, conversas: true } },
      },
    });
    res.json(contas);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/contas', requireAuth, async (req: any, res) => {
  try {
    const { nome, email, lojaId, clientId, clientSecret, accessToken } = req.body;
    const conta = await prisma.olxConta.create({
      data: {
        nome: String(nome || 'Conta OLX').trim(),
        email: String(email || '').trim(),
        lojaId: lojaId ? String(lojaId) : null,
        clientId: clientId ? String(clientId) : null,
        clientSecret: clientSecret ? String(clientSecret) : null,
        accessToken: accessToken ? String(accessToken) : null,
        statusConexao: 'ativo',
      },
    });
    res.status(201).json(conta);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Webhook da OLX para Notificações Instantâneas ──
router.post('/webhook', async (req, res) => {
  try {
    const evento = req.body;
    console.log('[OLX Webhook] Evento recebido:', evento);

    // Se for mensagem de chat recebida
    if (evento && evento.type === 'CHAT_MESSAGE' && evento.data) {
      const { chatId, adId, senderName, text } = evento.data;
      
      let conversa = await prisma.olxConversa.findFirst({
        where: { olxChatId: chatId },
      });

      if (!conversa) {
        conversa = await prisma.olxConversa.create({
          data: {
            olxChatId: chatId,
            compradorNome: senderName || 'Comprador OLX',
            ultimaMsg: text || '',
            naoLidas: 1,
          },
        });
      } else {
        await prisma.olxConversa.update({
          where: { id: conversa.id },
          data: {
            ultimaMsg: text || '',
            ultimaMsgData: new Date(),
            naoLidas: { increment: 1 },
          },
        });
      }

      await prisma.olxMensagem.create({
        data: {
          conversaId: conversa.id,
          fromMe: false,
          texto: text || '',
        },
      });
    }

    res.json({ received: true });
  } catch (e: any) {
    console.error('Erro no webhook OLX:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
