import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../server';
import { connectedUsers, logoutWhatsApp, resolverConexaoEfetiva } from '../workers/whatsappService';
import { conferirSenha, hashSenha } from '../auth/senha';
import { assinarToken } from '../auth/jwt';
import { requireMaster } from '../middlewares/requireModulo';
import { requireAuth } from '../middlewares/requireAuth';
import { lojaDoUsuario } from '../auth/escopoLoja';
import { cancelarBotDoUsuario } from '../workers/botAtendimentoService';
import { extensaoEstaOnline } from '../services/presencaExtensao';

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
    // externo:false sempre — parceiro da extensão (fora da equipe) nunca aparece aqui
    // nem no seletor de loja da Caixa de Entrada, só no painel escondido de Parceiros.
    const where: any = { ativo: true, externo: false };
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
        botIaAtivo: true,
        botIaPausaManualMin: true,
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

    // Contagem de mensagens por usuário para priorizar atendentes reais
    const contagensMsgs = await prisma.mensagem.groupBy({
      by: ['usuarioId'],
      _count: { id: true },
    });
    const mapaMsgCount: Record<string, number> = {};
    contagensMsgs.forEach((cm) => { mapaMsgCount[cm.usuarioId] = cm._count.id; });

    const comCompartilhamento = usuarios.map((u) => {
      const lojaNome = u.lojaId ? (lojaNomePorId[u.lojaId] || null) : null;
      const totalMensagens = mapaMsgCount[u.id] || (u.whatsappDonoId ? mapaMsgCount[u.whatsappDonoId] || 0 : 0);
      const extensaoOnline = extensaoEstaOnline(u.id);
      if (u.whatsappDonoId) {
        // Quem compartilha nunca tem whatsappConectado atualizado no próprio registro
        // (a sessão real nunca é dele) — usa somente o status ATUAL do dono em memória.
        // Não mistura com o campo salvo no banco, porque ele pode ficar "true" mesmo
        // com a sessão Baileys já caída, e isso deixa a Caixa de Entrada verde sem
        // mensagens novas chegando.
        return {
          ...u,
          lojaNome,
          totalMensagens,
          whatsappConectado: connectedUsers.has(u.whatsappDonoId),
          whatsappServidorConectado: connectedUsers.has(u.whatsappDonoId),
          extensaoOnline,
          whatsappDonoNome: nomesPorId[u.whatsappDonoId] || null
        };
      }
      return {
        ...u,
        lojaNome,
        totalMensagens,
        whatsappConectado: connectedUsers.has(u.id),
        whatsappServidorConectado: connectedUsers.has(u.id),
        extensaoOnline,
        whatsappDonoNome: null
      };
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

    // 09/09: parceiro entra nas metricas. Ele estava fora daqui E da lista de agendamentos,
    // entao o trabalho dele era invisivel pro dono (mesmo com dezenas de envios agendados).
    // Continua fora da tela de Usuarios (equipe formal) — la a regra antiga faz sentido.
    // O campo externo vai na resposta pra tela poder marcar quem e parceiro.
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
        externo: !!u.externo,
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

    const { senha: _senha, ...usuarioSemSenha } = usuarioAtualizado;
    res.json(usuarioSemSenha);
  } catch (error) {
    console.error('Erro ao atualizar auto-resposta:', error);
    res.status(500).json({ error: 'Erro ao atualizar auto-resposta' });
  }
});

// Ativa o cerebro de vendas somente no numero escolhido. A recepcao fixa e desligada
// junto para nunca mandar duas respostas ao mesmo cliente.
router.put('/:id/bot-ia', requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    const ativo = req.body?.ativo === true;
    const pausaManualMin = Math.max(15, Math.min(1440, Number(req.body?.pausaManualMin) || 120));
    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        botIaAtivo: ativo,
        botIaPausaManualMin: pausaManualMin,
        ...(ativo ? { autoRespostaAtiva: false } : {}),
      },
    });
    if (!ativo) cancelarBotDoUsuario(id);
    const { senha: _, ...seguro } = usuario;
    res.json(seguro);
  } catch (error) {
    console.error('Erro ao atualizar bot IA:', error);
    res.status(500).json({ error: 'Erro ao atualizar o bot de atendimento.' });
  }
});

// SELF-SERVICE: a própria pessoa logada (equipe OU parceiro externo) conecta o WhatsApp
// da conta dela mesma — usa o id de dentro do token (req.user.sub), nunca um id vindo do
// corpo da requisição, então não tem como pedir código pra conta de outra pessoa.
// Existe pro parceiro da extensão (sem acesso ao painel) conseguir ativar o agendamento
// sozinho, sem precisar que o master gere isso por ele toda vez.
//
// PRECISA vir ANTES de '/:id/codigo-pareamento' abaixo: o Express testa rotas na ordem
// em que são registradas, e '/:id/...' também bate com o literal "me" como se fosse um
// id — registrada depois, essa rota nunca seria alcançada (caiu nisso ao testar: dava
// "Apenas o administrador" porque quem respondia era a rota de baixo, não esta).
router.post('/me/codigo-pareamento', requireAuth, async (req, res) => {
  try {
    const id = String(req.user!.sub);
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ error: 'Informe o número de telefone (com DDD).' });
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario || !usuario.ativo) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (usuario.whatsappDonoId) {
      return res.status(400).json({ error: 'Sua conta compartilha o WhatsApp de outra pessoa — não é possível conectar uma conexão própria.' });
    }
    const { gerarCodigoPareamento } = require('../workers/whatsappService');
    const codigo = await gerarCodigoPareamento(id, String(numero));
    res.json({ codigo });
  } catch (error: any) {
    console.error('Erro ao gerar código de pareamento (self-service):', error?.message);
    res.status(400).json({ error: error?.message || 'Erro ao gerar código de pareamento.' });
  }
});

// Gerar CÓDIGO DE PAREAMENTO (8 dígitos) para conectar o WhatsApp sem QR.
// Body: { numero: 'DDI+DDD+telefone' }. O atendente digita o código no WhatsApp
// (Aparelhos conectados → Conectar com número de telefone).
//
// ⚠️ Adicionado requireAuth+requireMaster aqui em 04/08/2026: essa rota não tinha
// NENHUMA proteção — qualquer chamada com um :id válido gerava o código de
// pareamento de QUALQUER pessoa, sem checar se quem pediu era aquela mesma
// pessoa ou um admin. Achado ao construir a conexão self-service dos parceiros
// da extensão (ver /me/codigo-pareamento acima) — quem quiser conectar a
// PRÓPRIA conta agora usa a rota /me acima; esta aqui volta a ser só do painel
// (admin gerando pra outro atendente, fluxo original).
router.post('/:id/codigo-pareamento', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
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

router.post('/me/qr-code', requireAuth, async (req, res) => {
  try {
    const id = String(req.user!.sub);
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario || !usuario.ativo) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (usuario.whatsappDonoId) {
      return res.status(400).json({ error: 'Sua conta compartilha o WhatsApp de outra pessoa — não é possível conectar uma conexão própria.' });
    }
    const { gerarQrCodePareamento } = require('../workers/whatsappService');
    const qrCode = await gerarQrCodePareamento(id);
    res.json({ qrCode });
  } catch (error: any) {
    console.error('Erro ao gerar QR Code de pareamento (self-service):', error?.message);
    res.status(400).json({ error: error?.message || 'Erro ao gerar o QR Code de pareamento.' });
  }
});

// Gerar QR CODE de pareamento sob demanda pelo CRM. Diferente do fluxo antigo da
// extensão, aqui só sobe QR quando alguém clicar no botão do painel.
router.post('/:id/qr-code', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (!usuario) return res.status(404).json({ error: 'Atendente não encontrado.' });
    if (usuario.whatsappDonoId) {
      const dono = await prisma.usuario.findUnique({ where: { id: usuario.whatsappDonoId } });
      return res.status(400).json({ error: `Este atendente compartilha o WhatsApp de ${dono?.nome || 'outro atendente'}. Gere o QR para ${dono?.nome || 'o dono da conexão'} em vez disso.` });
    }
    const { gerarQrCodePareamento } = require('../workers/whatsappService');
    const qrCode = await gerarQrCodePareamento(id);
    res.json({ qrCode });
  } catch (error: any) {
    console.error('Erro ao gerar QR Code de pareamento:', error?.message);
    res.status(400).json({ error: error?.message || 'Erro ao gerar o QR Code de pareamento.' });
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

// ── PARCEIROS DA EXTENSÃO (painel escondido, só o master vê) ──────────────────────
// Gente de fora da equipe GP que usa só a extensão do WhatsApp, sem virar funcionário
// formal: entra com um CÓDIGO em vez de e-mail/senha. Fica de fora de qualquer tela
// normal (usuários, seletor de loja) — só existe nas rotas abaixo e no painel escondido.

// Alfabeto sem caracteres confundíveis (sem 0/O, 1/I/L) — o código é lido/digitado
// por gente de fora, então precisa ser fácil de copiar certo por WhatsApp/telefone.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Guarda SEM hífen (é a chave de busca — precisa bater exatamente com o que
// normalizarCodigo() produz a partir do que a pessoa digitar/colar, com ou sem
// hífen/espaço). Os hífens são só cosméticos, aplicados na hora de EXIBIR.
function gerarCodigoAtivacao(): string {
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALFABETO_CODIGO[bytes[i]! % ALFABETO_CODIGO.length];
  return s;
}
const normalizarCodigo = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

router.get('/parceiros', requireAuth, requireMaster, async (_req, res) => {
  try {
    const parceiros = await prisma.usuario.findMany({
      where: { externo: true },
      select: { id: true, nome: true, ativo: true, codigoAtivacao: true, whatsappConectado: true, criadoEm: true },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(parceiros);
  } catch (error) {
    console.error('Erro ao listar parceiros da extensão:', error);
    res.status(500).json({ error: 'Erro ao listar parceiros.' });
  }
});

router.post('/parceiros', requireAuth, requireMaster, async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Dê um nome pra identificar o parceiro.' });

    // Placeholder de e-mail/senha só pra satisfazer o schema — ninguém usa: o acesso
    // deste usuário é exclusivamente pelo código, nunca por /login.
    const email = `parceiro-${crypto.randomBytes(6).toString('hex')}@ext.gpcrm.local`;
    const senhaInutilizavel = await hashSenha(crypto.randomBytes(24).toString('hex'));
    const codigoAtivacao = gerarCodigoAtivacao();

    const parceiro = await prisma.usuario.create({
      data: {
        nome, email, senha: senhaInutilizavel,
        role: 'operador',
        modulosPermitidos: JSON.stringify(['at-inbox']), // só Caixa de Entrada — nada além disso
        externo: true,
        codigoAtivacao,
      },
      select: { id: true, nome: true, ativo: true, codigoAtivacao: true, whatsappConectado: true, criadoEm: true },
    });
    res.status(201).json(parceiro);
  } catch (error) {
    console.error('Erro ao criar parceiro da extensão:', error);
    res.status(500).json({ error: 'Erro ao criar parceiro.' });
  }
});

// Busca o parceiro por id e confere externo:true antes de qualquer ação — Prisma não
// aceita filtro composto em update/delete (where só leva campo único), então o check
// de "é mesmo um parceiro externo" é feito aqui, na mão, antes de tocar no registro.
async function acharParceiro(id: string) {
  const u = await prisma.usuario.findUnique({ where: { id } });
  return u && u.externo ? u : null;
}

router.post('/parceiros/:id/revogar', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!(await acharParceiro(id))) return res.status(404).json({ error: 'Parceiro não encontrado.' });
    // Some é imediato pra chamada nova; um token já emitido continua valendo até
    // expirar (até 12h) — o middleware de auth não confere o banco a cada request.
    const p = await prisma.usuario.update({ where: { id }, data: { ativo: false } });
    res.json({ ok: true, nome: p.nome });
  } catch {
    res.status(500).json({ error: 'Erro ao revogar.' });
  }
});

router.post('/parceiros/:id/reativar', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!(await acharParceiro(id))) return res.status(404).json({ error: 'Parceiro não encontrado.' });
    const p = await prisma.usuario.update({ where: { id }, data: { ativo: true } });
    res.json({ ok: true, nome: p.nome });
  } catch {
    res.status(500).json({ error: 'Erro ao reativar.' });
  }
});

// Gera um código novo — invalida o antigo na hora (quem ainda não trocou por token
// não consegue mais; quem já tinha token válido segue até ele expirar).
router.post('/parceiros/:id/novo-codigo', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!(await acharParceiro(id))) return res.status(404).json({ error: 'Parceiro não encontrado.' });
    const p = await prisma.usuario.update({
      where: { id },
      data: { codigoAtivacao: gerarCodigoAtivacao() },
    });
    res.json({ codigoAtivacao: p.codigoAtivacao });
  } catch {
    res.status(500).json({ error: 'Erro ao gerar novo código.' });
  }
});

router.delete('/parceiros/:id', requireAuth, requireMaster, async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!(await acharParceiro(id))) return res.status(404).json({ error: 'Parceiro não encontrado.' });
    await prisma.usuario.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir.' });
  }
});

// PÚBLICA DE PROPÓSITO — é o próprio mecanismo de login do parceiro (troca o código
// pelo token, no lugar de e-mail/senha). O código tem 12 caracteres aleatórios (~10^18
// combinações), então adivinhar não é viável; tentativa inválida só loga um aviso.
router.post('/ativar-extensao', async (req, res) => {
  try {
    const codigo = normalizarCodigo(req.body?.codigo);
    if (!codigo) return res.status(400).json({ error: 'Digite o código de ativação.' });

    const parceiro = await prisma.usuario.findFirst({ where: { codigoAtivacao: codigo, externo: true } });
    if (!parceiro) {
      console.warn(`[ativar-extensao] Código não encontrado (tentativa): ${codigo.slice(0, 4)}****`);
      return res.status(401).json({ error: 'Código inválido.' });
    }
    if (!parceiro.ativo) return res.status(401).json({ error: 'Este código foi revogado.' });

    const modulos = parseModulos(parceiro.modulosPermitidos);
    const token = assinarToken({ sub: parceiro.id, role: parceiro.role, lojaId: parceiro.lojaId || null, modulos });
    const { senha: _, codigoAtivacao: __, ...dados } = parceiro;
    // Mesmo formato do /login (campos no topo + token + usuario) — a extensão lê
    // data.token/data.id/data.nome direto, sem precisar saber que veio por código.
    res.json({ ...dados, token, usuario: dados });
  } catch (error) {
    console.error('Erro ao ativar extensão por código:', error);
    res.status(500).json({ error: 'Erro interno ao ativar.' });
  }
});

export default router;
