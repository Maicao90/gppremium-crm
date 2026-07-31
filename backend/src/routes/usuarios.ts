import { Router } from 'express';
import { prisma } from '../server';
import { connectedUsers, logoutWhatsApp, resolverConexaoEfetiva } from '../workers/whatsappService';
import { conferirSenha, hashSenha } from '../auth/senha';
import { assinarToken } from '../auth/jwt';
import { requireMaster } from '../middlewares/requireModulo';
import { requireAuth } from '../middlewares/requireAuth';
import { lojaDoUsuario } from '../auth/escopoLoja';

const router = Router();

const parseModulos = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } }
  return [];
};

// Rota de login — confere a senha (hash bcrypt ou legada) e devolve um token JWT.
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: String(email).toLowerCase().trim() }
    });

    if (usuario && !usuario.ativo) {
      return res.status(401).json({ error: 'Usuário inativo.' });
    }

    if (!usuario || !(await conferirSenha(String(senha), usuario.senha))) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    const modulos = parseModulos(usuario.modulosPermitidos);
    const token = assinarToken({ sub: usuario.id, role: usuario.role, lojaId: usuario.lojaId || null, modulos });
    const { senha: _, ...usuarioDados } = usuario;
    // Retrocompatível: campos do usuário no TOPO (a extensão lê data.id/data.nome
    // direto) + `token` e `usuario` para o painel novo. Não quebra a extensão atual.
    res.json({ ...usuarioDados, token, usuario: usuarioDados });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno ao realizar login' });
  }
});

// Cadastrar novo usuário/atendente (apenas master)
router.post('/cadastrar', requireMaster, async (req, res) => {
  try {
    const { nome, email, senha, role, lojaId, modulosPermitidos } = req.body;
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
        senha: await hashSenha(String(senha)),
        role: role || 'operador',
        lojaId: lojaId || null,
        modulosPermitidos: JSON.stringify(parseModulos(modulosPermitidos))
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
    // Gerente logado no painel só enxerga atendentes da própria loja (papel/loja
    // lidos do banco — imune a token velho). Sem token (extensão) ou master: vê tudo.
    const where: any = { ativo: true };
    const ljLista = await lojaDoUsuario(req);
    if (ljLista) where.lojaId = ljLista;
    const usuarios = await prisma.usuario.findMany({
      where,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        whatsappConectado: true,
        whatsappDonoId: true,
        lojaId: true,
        modulosPermitidos: true,
        criadoEm: true
      },
      orderBy: { nome: 'asc' }
    });
    const nomesPorId: Record<string, string> = {};
    usuarios.forEach((u) => { nomesPorId[u.id] = u.nome; });

    // Nome da LOJA de cada atendente — a Caixa de Entrada agrupa os números por loja
    // (uma loja pode ter 2 números, ex.: Feirão = Marina + Ana Paula), então o front
    // precisa do rótulo, não só do lojaId.
    const lojaIds = [...new Set(usuarios.map((u) => u.lojaId).filter(Boolean) as string[])];
    const lojas = lojaIds.length
      ? await prisma.loja.findMany({ where: { id: { in: lojaIds } }, select: { id: true, store_name: true } })
      : [];
    const lojaNomePorId: Record<string, string> = {};
    lojas.forEach((l) => { lojaNomePorId[l.id] = l.store_name; });

    const comCompartilhamento = usuarios.map((u) => {
      const lojaNome = u.lojaId ? (lojaNomePorId[u.lojaId] || null) : null;
      if (u.whatsappDonoId) {
        // Quem compartilha nunca tem whatsappConectado atualizado no próprio registro
        // (a sessão real nunca é dele) — usa o status ATUAL do dono em memória.
        return {
          ...u,
          lojaNome,
          whatsappConectado: connectedUsers.has(u.whatsappDonoId),
          whatsappDonoNome: nomesPorId[u.whatsappDonoId] || null
        };
      }
      return { ...u, lojaNome, whatsappDonoNome: null };
    });
    res.json(comCompartilhamento);
  } catch (error) {
    console.error('Erro ao buscar usuários:', error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Buscar estatísticas/métricas de agendamentos por filtro de período.
// requireAuth: tela EXCLUSIVA do painel (a extensão não usa) — sem token, 401. Isso
// fecha o buraco de, sem token, o escopo ser pulado e devolver todas as lojas.
router.get('/metricas', requireAuth, async (req, res) => {
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

    // Busca usuários ativos e inclui apenas os agendamentos do período selecionado.
    // Gerente só vê as métricas dos atendentes da própria loja (papel/loja lidos do
    // banco — imune a token velho de quem foi promovido a gerente após o login).
    const whereU: any = { ativo: true };
    const ljMetricas = await lojaDoUsuario(req);
    if (ljMetricas) whereU.lojaId = ljMetricas;
    const usuarios = await prisma.usuario.findMany({
      where: whereU,
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

// Atualizar atendente (editar nome, e-mail, senha, permissão, módulos) — apenas master.
// Senha é opcional: em branco mantém a atual (não força retypar).
router.put('/:id', requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { nome, email, senha, role, lojaId, modulosPermitidos } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
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

    const data: any = {
      nome,
      email: emailLimpo,
      role: role || 'operador',
      lojaId: lojaId || null
    };
    if (senha) data.senha = await hashSenha(String(senha));
    if (modulosPermitidos !== undefined) data.modulosPermitidos = JSON.stringify(parseModulos(modulosPermitidos));

    const usuarioAtualizado = await prisma.usuario.update({ where: { id }, data });
    const { senha: _s, ...usuarioDados } = usuarioAtualizado;
    res.json(usuarioDados);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar atendente' });
  }
});

// Excluir atendente (apenas master)
router.delete('/:id', requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);

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
