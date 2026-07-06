import { Router } from 'express';
import { prisma } from '../server';
import { connectedUsers, logoutWhatsApp, resolverConexaoEfetiva } from '../workers/whatsappService';

const router = Router();

// Rota de login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (usuario && !usuario.ativo) {
      return res.status(401).json({ error: 'Usuário inativo.' });
    }

    if (!usuario || usuario.senha !== senha) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Retorna o usuário autenticado sem expor a senha por completo se preferir, 
    // mas retornaremos o objeto normal para simplicidade local.
    const { senha: _, ...usuarioDados } = usuario;
    res.json(usuarioDados);
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno ao realizar login' });
  }
});

// Cadastrar novo operador
router.post('/cadastrar', async (req, res) => {
  try {
    const { nome, email, senha, role, lojaId } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Verificar se e-mail já existe
    const existente = await prisma.usuario.findUnique({
      where: { email: emailLimpo }
    });

    if (existente) {
      return res.status(400).json({ error: 'E-mail já está sendo utilizado.' });
    }

    const novoUsuario = await prisma.usuario.create({
      data: {
        nome,
        email: emailLimpo,
        senha,
        role: role || 'operador',
        lojaId: lojaId || null
      }
    });

    const { senha: _, ...usuarioDados } = novoUsuario;
    res.status(201).json(usuarioDados);
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    res.status(500).json({ error: 'Erro ao cadastrar operador' });
  }
});

// Listar todos os usuários
router.get('/', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        whatsappConectado: true,
        whatsappDonoId: true,
        lojaId: true,
        criadoEm: true
      },
      orderBy: { nome: 'asc' }
    });
    const nomesPorId: Record<string, string> = {};
    usuarios.forEach((u) => { nomesPorId[u.id] = u.nome; });
    const comCompartilhamento = usuarios.map((u) => {
      if (u.whatsappDonoId) {
        // Quem compartilha nunca tem whatsappConectado atualizado no próprio registro
        // (a sessão real nunca é dele) — usa o status ATUAL do dono em memória.
        return {
          ...u,
          whatsappConectado: connectedUsers.has(u.whatsappDonoId),
          whatsappDonoNome: nomesPorId[u.whatsappDonoId] || null
        };
      }
      return { ...u, whatsappDonoNome: null };
    });
    res.json(comCompartilhamento);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Buscar estatísticas/métricas de agendamentos por filtro de período
router.get('/metricas', async (req, res) => {
  try {
    const { periodo } = req.query; // dia, semana, mes, ano
    const agora = new Date();
    let dataInicio = new Date();

    if (periodo === 'dia') {
      dataInicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'semana') {
      dataInicio.setDate(agora.getDate() - 7);
      dataInicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'mes') {
      dataInicio.setDate(agora.getDate() - 30);
      dataInicio.setHours(0, 0, 0, 0);
    } else if (periodo === 'ano') {
      dataInicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0, 0);
    } else {
      // Padrão: dia (hoje)
      dataInicio.setHours(0, 0, 0, 0);
    }

    // Busca usuários ativos e inclui apenas os agendamentos do período selecionado
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true },
      include: {
        agendamentos: {
          where: {
            criadoEm: {
              gte: dataInicio
            }
          }
        }
      }
    });

    const nomesPorId: Record<string, string> = {};
    usuarios.forEach((u) => { nomesPorId[u.id] = u.nome; });

    const metricas = usuarios.map(u => {
      const total = u.agendamentos.length;
      const enviados = u.agendamentos.filter(a => a.status === 'enviado').length;
      const pendentes = u.agendamentos.filter(a => a.status === 'pendente').length;
      const falhados = u.agendamentos.filter(a => a.status === 'falhou').length;
      // Quem compartilha o WhatsApp de outro atendente: o status conectado real é o
      // do DONO (o próprio registro nunca é atualizado, pois a sessão nunca é dele).
      const whatsappConectado = u.whatsappDonoId ? connectedUsers.has(u.whatsappDonoId) : u.whatsappConectado;
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        senha: u.senha,
        role: u.role,
        whatsappConectado,
        whatsappDonoId: u.whatsappDonoId ?? null,
        whatsappDonoNome: u.whatsappDonoId ? (nomesPorId[u.whatsappDonoId] || null) : null,
        assinaturaPainel: u.assinaturaPainel ?? null,
        total,
        enviados,
        pendentes,
        falhados,
        conversao: total > 0 ? Math.round((enviados / total) * 100) : 0
      };
    });

    res.json(metricas);
  } catch (error) {
    console.error('Erro ao buscar métricas de usuários:', error);
    res.status(500).json({ error: 'Erro ao processar métricas.' });
  }
});

// Atualizar a assinatura do painel CRM (separada da extensão)
router.put('/:id/assinatura', async (req, res) => {
  try {
    const { id } = req.params;
    const { assinaturaPainel } = req.body;
    const u = await prisma.usuario.update({
      where: { id },
      data: { assinaturaPainel: (assinaturaPainel === null || assinaturaPainel === undefined) ? null : String(assinaturaPainel) }
    });
    res.json({ success: true, assinaturaPainel: u.assinaturaPainel });
  } catch (error) {
    console.error('Erro ao salvar assinatura do painel:', error);
    res.status(500).json({ error: 'Erro ao salvar assinatura' });
  }
});

// Atualizar atendente (editar nome, e-mail, senha e permissão)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, senha, role, lojaId } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    const emailLimpo = email.toLowerCase().trim();

    // Verificar se o e-mail já está em uso por outro usuário
    const existente = await prisma.usuario.findFirst({
      where: {
        email: emailLimpo,
        NOT: { id }
      }
    });

    if (existente) {
      return res.status(400).json({ error: 'E-mail já está sendo utilizado por outro atendente.' });
    }

    const usuarioAtualizado = await prisma.usuario.update({
      where: { id },
      data: {
        nome,
        email: emailLimpo,
        senha,
        role: role || 'operador',
        lojaId: lojaId || null
      }
    });

    res.json(usuarioAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar atendente' });
  }
});

// Excluir atendente
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.usuario.update({
      where: { id },
      data: { ativo: false }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Erro ao excluir atendente' });
  }
});

// Atualizar auto-resposta do atendente
router.put('/:id/autoresposta', async (req, res) => {
  try {
    const { id } = req.params;
    const { autoRespostaAtiva, autoRespostaMensagem } = req.body;
    
    const usuarioAtualizado = await prisma.usuario.update({
      where: { id },
      data: {
        autoRespostaAtiva: Boolean(autoRespostaAtiva),
        autoRespostaMensagem: autoRespostaMensagem || ''
      }
    });

    res.json(usuarioAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar auto-resposta:', error);
    res.status(500).json({ error: 'Erro ao atualizar auto-resposta' });
  }
});

// Gerar CÓDIGO DE PAREAMENTO (8 dígitos) para conectar o WhatsApp sem QR.
// Body: { numero: 'DDI+DDD+telefone' }. O atendente digita o código no WhatsApp
// (Aparelhos conectados → Conectar com número de telefone).
router.post('/:id/codigo-pareamento', async (req, res) => {
  try {
    const { id } = req.params;
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ error: 'Informe o número de telefone (com DDD).' });
    // Quem COMPARTILHA WhatsApp não tem conexão própria pra parear — gerar código pra
    // ele seria enganoso (o no-op em connectToWhatsApp faria isso falhar silenciosamente).
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (usuario?.whatsappDonoId) {
      const dono = await prisma.usuario.findUnique({ where: { id: usuario.whatsappDonoId } });
      return res.status(400).json({ error: `Este atendente compartilha o WhatsApp de ${dono?.nome || 'outro atendente'}. Gere o código para ${dono?.nome || 'o dono da conexão'} em vez disso.` });
    }
    const { gerarCodigoPareamento } = require('../workers/whatsappService');
    const codigo = await gerarCodigoPareamento(id, String(numero));
    res.json({ codigo });
  } catch (error: any) {
    console.error('Erro ao gerar código de pareamento:', error?.message);
    res.status(400).json({ error: error?.message || 'Erro ao gerar código de pareamento.' });
  }
});

// Pausar as tentativas de conexão do WhatsApp (para o QR infinito de conta travada)
router.post('/:id/pausar', async (req, res) => {
  try {
    const { pausarWhatsApp } = require('../workers/whatsappService');
    // Resolve pro DONO real: pausar quem compartilha, sem isso, era um no-op enganoso
    // (retornava sucesso mas não afetava a conexão de verdade).
    const efetivoId = await resolverConexaoEfetiva(req.params.id);
    await pausarWhatsApp(efetivoId);
    res.json({ success: true, pausado: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Erro ao pausar.' });
  }
});

// Retomar as tentativas de conexão do WhatsApp
router.post('/:id/retomar', async (req, res) => {
  try {
    const { retomarWhatsApp } = require('../workers/whatsappService');
    const efetivoId = await resolverConexaoEfetiva(req.params.id);
    await retomarWhatsApp(efetivoId);
    res.json({ success: true, pausado: false });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Erro ao retomar.' });
  }
});

// Desconectar o WhatsApp do atendente
router.post('/:id/desconectar', async (req, res) => {
  try {
    const { id } = req.params;
    // Resolve pro DONO real: desconectar quem compartilha precisa derrubar a sessão
    // de verdade (do dono), senão "sucesso" não desconectava nada.
    const efetivoId = await resolverConexaoEfetiva(id);
    await logoutWhatsApp(efetivoId);

    // Dispara evento para a extensão via socket.io — quem compartilha também está
    // na sala do efetivoId (server.ts), então recebe o aviso normalmente.
    const { io } = require('../server');
    io.to(efetivoId).emit('RELOAD_EXTENSION');

    res.json({ success: true, message: 'WhatsApp desconectado com sucesso.' });
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao desconectar WhatsApp' });
  }
});

// Faz este atendente PASSAR A COMPARTILHAR o WhatsApp de outro (o "dono" da conexão
// real). Body: { donoId }. Derruba a sessão própria (se houver) antes de setar, para
// não sobrar um "aparelho vinculado" fantasma da conta do WhatsApp.
router.post('/:id/compartilhar-whatsapp', async (req, res) => {
  try {
    const { id } = req.params;
    const { donoId } = req.body;
    if (!donoId) return res.status(400).json({ error: 'Informe o donoId.' });
    if (String(donoId) === String(id)) return res.status(400).json({ error: 'Um atendente não pode compartilhar o WhatsApp dele mesmo.' });

    // TRAVA A LINHA do "dono" (SELECT ... FOR UPDATE) durante checagem + gravação:
    // sem isso, 2 requisições concorrentes (ex.: A tenta compartilhar de B e B tenta
    // compartilhar de A ao mesmo tempo) podiam passar as duas pela checagem "dono não
    // compartilha de ninguém" ANTES de qualquer update, criando um ciclo de 2 — os dois
    // atendentes ficavam sem sessão real, sem nenhum erro aparente.
    await prisma.$transaction(async (tx) => {
      const linhas: any[] = await tx.$queryRaw`SELECT id, nome, "whatsappDonoId" FROM "Usuario" WHERE id = ${String(donoId)} FOR UPDATE`;
      const dono = linhas[0];
      if (!dono) throw Object.assign(new Error('Atendente "dono" não encontrado.'), { status: 400 });
      if (dono.whatsappDonoId) {
        throw Object.assign(new Error('Esse atendente já compartilha o WhatsApp de outra pessoa — escolha o atendente original.'), { status: 400 });
      }
      // Desfaz qualquer sessão própria que :id já tivesse (evita "aparelho vinculado" fantasma).
      await logoutWhatsApp(id);
      await tx.usuario.update({ where: { id }, data: { whatsappDonoId: String(donoId) } });
    });

    res.json({ success: true });
  } catch (error: any) {
    const status = error?.status || 500;
    if (status === 500) console.error('Erro ao configurar compartilhamento de WhatsApp:', error);
    res.status(status).json({ error: error?.message || 'Erro ao configurar compartilhamento.' });
  }
});

// Desfaz o compartilhamento: o atendente volta a poder ter conexão própria (precisa
// parear do zero via QR/código depois — nenhuma sessão é restaurada automaticamente).
router.post('/:id/parar-compartilhar', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.usuario.update({ where: { id }, data: { whatsappDonoId: null } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao parar compartilhamento de WhatsApp:', error);
    res.status(500).json({ error: error?.message || 'Erro ao parar compartilhamento.' });
  }
});

export default router;
