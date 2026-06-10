import { Router } from 'express';
import { prisma } from '../server';

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
    const { nome, email, senha, role } = req.body;
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
        role: role || 'operador'
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
        criadoEm: true
      },
      orderBy: { nome: 'asc' }
    });
    res.json(usuarios);
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

    const metricas = usuarios.map(u => {
      const total = u.agendamentos.length;
      const enviados = u.agendamentos.filter(a => a.status === 'enviado').length;
      const pendentes = u.agendamentos.filter(a => a.status === 'pendente').length;
      const falhados = u.agendamentos.filter(a => a.status === 'falhou').length;
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        senha: u.senha,
        role: u.role,
        whatsappConectado: u.whatsappConectado,
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
    const { nome, email, senha, role } = req.body;
    
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
        role: role || 'operador'
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

// Desconectar o WhatsApp do atendente
router.post('/:id/desconectar', async (req, res) => {
  try {
    const { id } = req.params;
    const { logoutWhatsApp } = require('../workers/whatsappService');
    await logoutWhatsApp(id);
    
    // Dispara evento para a extensão via socket.io
    const { io } = require('../server');
    io.to(id).emit('RELOAD_EXTENSION');
    
    res.json({ success: true, message: 'WhatsApp desconectado com sucesso.' });
  } catch (error) {
    console.error('Erro ao desconectar WhatsApp:', error);
    res.status(500).json({ error: 'Erro ao desconectar WhatsApp' });
  }
});

export default router;
