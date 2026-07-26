import express from 'express';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { initWorker } from './workers/agendaWorker';
import { connectToWhatsApp, latestQR, connectedUsers, carregarPausadosDoBanco, resolverConexaoEfetiva } from './workers/whatsappService';
import agendamentosRouter from './routes/agendamentos';
import contatosRouter from './routes/contatos';
import configuracoesRouter from './routes/configuracoes';
import usuariosRouter from './routes/usuarios';
import inboxRouter from './routes/inbox';
import iaRouter from './routes/ia';
import crmAnunciosRouter from './routes/crmAnuncios';
import integracoesRouter from './routes/integracoes';
import paginaLinksRouter from './routes/paginaLinks';
import otimizadorAdsRouter from './routes/otimizadorAds';
import botPneusRouter from './routes/botPneus';
import disparoRouter from './routes/disparo';
import { paginaLinkPublica } from './middlewares/paginaLinkPublica';
import { initSyncAds } from './integracoes/syncService';
import { requireAuth } from './middlewares/requireAuth';
import { requireModulo, requireAnyModulo } from './middlewares/requireModulo';
import { authOpcional, authWhatsapp } from './middlewares/requireAuth';
import { hashSenha } from './auth/senha';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check DE VERDADE: testa o banco, não só se o processo está de pé. Sem isso,
// o watchdog (curl em "/") só via se o Node respondia — se o CloudManager falhasse ao
// conectar no boot (ex.: blip de rede no Supabase) e não sobrasse nuvem de reserva
// configurada, o app ficava "online" no pm2 mas TUDO que toca banco quebrado, sem
// ninguém perceber (aconteceu em 24/07/2026, ~20min até o Maicon notar via "erro ao
// buscar usuários"). `prisma` é referenciado aqui mas só é usado quando a rota é
// chamada — nesse ponto o módulo inteiro já terminou de carregar, então é seguro
// mesmo declarado mais abaixo no arquivo.
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.configuracao.count();
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(503).json({ ok: false, error: e?.message || 'Banco indisponível' });
  }
});

// Lógica de boot em HTTPS nativo seguro
let server: any;
try {
  const keyPath = path.join(__dirname, '../key.pem');
  const certPath = path.join(__dirname, '../cert.pem');
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const options = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
    server = https.createServer(options, app);
    console.log('[SSL] Iniciando servidor em modo seguro HTTPS (SSL nativo)!');
  } else {
    server = http.createServer(app);
    console.log('[SSL] Chaves SSL não encontradas. Iniciando em modo padrão HTTP.');
  }
} catch (e) {
  server = http.createServer(app);
  console.log('[SSL] Falha ao configurar SSL. Iniciando em modo padrão HTTP.');
}

export const io = new Server(server, {
  cors: { origin: '*' }
});

// Integração com Failover Multi-Cloud
import { cloudManager } from './cloudManager';

// Exporta um proxy que intercepta as chamadas para o Prisma
// Isso garante que todos os arquivos (whatsappService, agendaWorker, rotas)
// sempre usem a instância mais recente do Prisma, que pode mudar caso ocorra um Failover.
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    return cloudManager.getPrisma()[prop as keyof PrismaClient];
  }
});

let coreIniciado = false;
async function iniciarCoreDoSistema() {
  if (coreIniciado) return;
  try {
    // Tenta acessar o banco só para garantir que subiu
    await prisma.configuracao.count(); 
    coreIniciado = true;
    console.log('[Core] Iniciando workers principais...');
    initWorker();
    initSyncAds(); // sincronização periódica de Google Ads / Meta Ads
    
    // Restaura do banco quem estava PAUSADO antes deste restart (senão o vigia
    // reconecta sozinho e gera QR infinito de contas que pedimos pra não mexer).
    await carregarPausadosDoBanco();

    // Inicia a conexão do WhatsApp para todos os usuários que estão ativos e possivelmente conectados
    try {
      const usuarios = await prisma.usuario.findMany({ where: { ativo: true } });
      for (const user of usuarios) {
        connectToWhatsApp(user.id).catch(err => console.error(`[Baileys] Erro ao iniciar WhatsApp para ${user.id}:`, err));
      }
    } catch (err) {
      console.error('[Core] Erro ao carregar usuários para iniciar o WhatsApp:', err);
    }
    
    await seedAdmin();
    await migrarSenhas();
    await ensureMaster();
  } catch (err) {
    console.error('[Core] Erro ao iniciar core:', err);
  }
}

// Garante que SEMPRE exista um master ativo pra entrar no painel. Só age quando
// NÃO há nenhum master/admin ativo (idempotente): reativa/cria admin@crm.com com
// senha inicial "admin123" (o dono troca no painel). Depois que houver um master
// ativo, não mexe mais — preserva a senha escolhida.
async function ensureMaster() {
  try {
    const jaTem = await prisma.usuario.findFirst({ where: { ativo: true, role: { in: ['master', 'admin'] } } });
    if (jaTem) return;
    const email = 'admin@crm.com';
    const hash = await hashSenha('admin123');
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      await prisma.usuario.update({ where: { email }, data: { ativo: true, role: 'admin', senha: hash, modulosPermitidos: '[]' } });
      console.log('[auth] Master admin@crm.com REATIVADO (senha inicial admin123 — troque no painel).');
    } else {
      await prisma.usuario.create({ data: { nome: 'Administrador Master', email, senha: hash, role: 'admin', ativo: true, modulosPermitidos: '[]' } });
      console.log('[auth] Master admin@crm.com CRIADO (senha inicial admin123 — troque no painel).');
    }
  } catch (e) {
    console.error('[auth] Erro ao garantir master ativo:', e);
  }
}

// Migra senhas legadas (texto puro) para hash bcrypt, uma vez. Idempotente:
// senhas já em hash (começam com "$2") são ignoradas.
async function migrarSenhas() {
  try {
    const legadas = await prisma.usuario.findMany({ where: { NOT: { senha: { startsWith: '$2' } } } });
    let n = 0;
    for (const u of legadas) {
      if (u.senha) { await prisma.usuario.update({ where: { id: u.id }, data: { senha: await hashSenha(u.senha) } }); n++; }
    }
    if (n) console.log(`[auth] ${n} senha(s) migrada(s) para hash bcrypt.`);
  } catch (err) {
    console.error('[auth] Erro ao migrar senhas:', err);
  }
}

// Inicia o Failover no boot
cloudManager.initializeFailover().then(({ ativo }) => {
  if (ativo) {
    iniciarCoreDoSistema();
  } else {
    console.warn('\n======================================================');
    console.warn('BANCO DE DADOS NÃO CONFIGURADO OU FORA DO AR!');
    console.warn('O sistema principal está pausado.');
    console.warn('Acesse: http://localhost:3000/admin para configurar.');
    console.warn('======================================================\n');
  }
});

// Link na Bio: intercepta requisições cujo Host bata com o subdominio cadastrado de
// alguma Loja e serve a página pública direto, ANTES do static/rotas normais. Para
// qualquer outro Host (ex.: crm.nailacademyprofissional.com), cai no next() e o
// comportamento atual continua 100% intacto.
app.use(paginaLinkPublica);

// Servir arquivos estáticos da pasta public/ (admin.html, admin/index.html, etc.)
app.use(express.static(path.join(__dirname, '../public')));

// Rota explícita para o painel admin principal
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Rota para o painel de credenciais de nuvem
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Rotas de API
// Rotas de WhatsApp/atendimento: authOpcional popula req.user quando há token
// (gerente no painel → escopado por loja dentro dos handlers), MAS não bloqueia
// quem chega sem token (a extensão dos atendentes continua funcionando igual).
app.use('/api/agendamentos', authWhatsapp, agendamentosRouter);
app.use('/api/contatos', authWhatsapp, contatosRouter);
app.use('/api/configuracoes', configuracoesRouter);
// login é público; as escritas de usuário exigem master (requireMaster dentro do router).
app.use('/api/usuarios', authOpcional, usuariosRouter);
app.use('/api/inbox', authWhatsapp, inboxRouter);
app.use('/api/bot-pneus', authWhatsapp, botPneusRouter); // Bot Pneus (Charles) — proxy pro pneus-bot da Vercel
// Ferramentas 100% do painel de anúncios: enforce no servidor (gerente sem esses módulos → 403).
app.use('/api/ia', requireAuth, requireModulo('assistant'), iaRouter); // Assistente IA (Claude)
app.use('/api/integracoes', requireAuth, requireAnyModulo(['dashboard', 'otimizador']), integracoesRouter); // Google/Meta Ads
app.use('/api', crmAnunciosRouter); // /api/empresas, /api/lojas, /api/campanhas, /api/contas (gate por loja: Fase 2)
app.use('/api/paginalinks', requireAuth, requireModulo('linkbio'), paginaLinksRouter); // Link na Bio
app.use('/api/otimizador', requireAuth, requireModulo('otimizador'), otimizadorAdsRouter); // Otimizador
app.use('/api/disparo', requireAuth, requireModulo('at-disparo'), disparoRouter); // Disparo manual WhatsApp (Direcional)

// Rotas da API de Nuvem do Painel Admin
app.get('/api/admin/nuvem', (req, res) => {
  const configs = cloudManager.getConfigs();
  const ativo = cloudManager.getAtivo();
  res.json({ ...configs, ativo });
});

// Dispara o lembrete de agendamentos AGORA para todos os atendentes conectados (manual/teste)
app.get('/api/admin/disparar-lembrete', async (req, res) => {
  try {
    const { dispararLembretesAgora } = require('./workers/whatsappService');
    const enviados = await dispararLembretesAgora();
    res.json({ enviados });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Recarrega a extensão em TODOS os PCs conectados agora (via socket RELOAD_EXTENSION).
// Cada extensão dá window.location.reload() → re-sincroniza a agenda e pega o estado
// mais novo do servidor. É o "atualizar em todos os PCs conectados" de uma vez.
app.get('/api/admin/reload-extensoes', (req, res) => {
  try {
    const conectados = io.engine?.clientsCount ?? 0;
    io.emit('RELOAD_EXTENSION');
    console.log(`[admin] RELOAD_EXTENSION disparado para ${conectados} socket(s) conectado(s).`);
    res.json({ ok: true, socketsConectados: conectados });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Erro' });
  }
});

app.post('/api/admin/nuvem', async (req, res) => {
  try {
    const { planoA, planoB, planoC } = req.body;
    await cloudManager.saveConfigs({ planoA, planoB, planoC });
    
    const { ativo } = await cloudManager.initializeFailover();
    if (ativo) {
      iniciarCoreDoSistema();
      res.json({ success: true, ativo });
    } else {
      res.status(400).json({ error: 'Nenhuma das URLs fornecidas conseguiu conectar.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rota de logs em tempo real direcionados da extensão para diagnóstico
app.post('/api/extension-logs', (req, res) => {
  const { nivel, escopo, mensagem, erro } = req.body;
  const prefixo = `[BROWSER-${(escopo || 'GERAL').toUpperCase()}]`;
  const timestamp = new Date().toLocaleTimeString();
  
  if (nivel === 'error') {
    console.error(`\x1b[31m${timestamp} ${prefixo} ❌ ${mensagem}\x1b[0m`, erro ? `\nDetalhes do Erro: ${JSON.stringify(erro)}` : '');
  } else if (nivel === 'warn') {
    console.warn(`\x1b[33m${timestamp} ${prefixo} ⚠️ ${mensagem}\x1b[0m`);
  } else {
    console.log(`\x1b[36m${timestamp} ${prefixo} ℹ️ ${mensagem}\x1b[0m`);
  }
  res.sendStatus(200);
});

// Mapeamento global de sockets conectados por atendente
export const usuariosConectados = new Map<string, string>(); // socket.id -> usuarioId

io.on('connection', async (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Registra atendente ativo no socket conectado
  socket.on('registrar_atendente', async (usuarioId) => {
    const uid = String(usuarioId);
    console.log(`[Socket] Atendente ${uid} registrado no socket ${socket.id}`);
    usuariosConectados.set(socket.id, uid);

    // COMPARTILHAMENTO DE WHATSAPP: se este atendente compartilha a conexão de outro
    // (whatsappDonoId), a sessão Baileys REAL vive sob o ID do dono. Resolve isso ANTES
    // de decidir status/QR/conectar — senão quem compartilha nunca sai de "Aguardando".
    const efetivoId = await resolverConexaoEfetiva(uid);

    // Entrar na sala do próprio usuário E na sala do dono (se for diferente), para
    // receber eventos emitidos para a sala do dono (NOVA_MENSAGEM, WHATSAPP_STATUS, etc.)
    socket.join(uid);
    if (efetivoId !== uid) socket.join(efetivoId);

    // CORREÇÃO DO "AGUARDANDO QR" ETERNO:
    // Informa IMEDIATAMENTE o estado atual a esta extensão que acabou de conectar.
    // Sem isso, um QR gerado antes da extensão abrir (ex.: no boot da VPS) se perdia
    // e a tela ficava travada em "Aguardando QR Code".
    if (connectedUsers.has(efetivoId)) {
      // Já está conectado: avisa a extensão para sair da tela de QR.
      socket.emit('WHATSAPP_STATUS', { conectado: true });
    } else if (latestQR.has(efetivoId)) {
      // Existe um QR pendente: reenvia na hora para esta extensão.
      console.log(`[Socket] Reenviando QR Code pendente para o atendente ${efetivoId}.`);
      socket.emit('WHATSAPP_QR_CODE', latestQR.get(efetivoId));
    }

    // Garante que o WhatsApp está conectado ou em processo de conexão para o DONO da
    // conexão efetiva. (Se não houver sessão, cria uma nova e o QR fluirá para a sala
    // onde a extensão já está — inclusive quem compartilha, que também entrou nela acima.)
    connectToWhatsApp(efetivoId, socket.id).catch(err => console.error(`[Baileys] Erro crítico ao conectar WhatsApp do usuário ${efetivoId}:`, err));
  });

  // Painel admin: "assistir" a caixa de entrada de um atendente (entra na sala para
  // receber NOVA_MENSAGEM em tempo real, SEM os efeitos do registrar_atendente).
  socket.on('assistir_atendente', (usuarioId) => {
    socket.join(String(usuarioId));
  });

  // Quando a extensão se conecta (WhatsApp Web abriu), recupera IMEDIATAMENTE 
  // todos os agendamentos que porventura estejam no status 'enviando' de volta para 'pendente'
  // para que o worker os envie instantaneamente no próximo ciclo, sem atrasos.
  try {
    const recuperados = await prisma.agendamento.updateMany({
      where: { status: 'enviando' },
      data: { status: 'pendente' }
    });
    if (recuperados.count > 0) {
      console.log(`[Socket] Conectado! Recuperados instantaneamente ${recuperados.count} agendamento(s) 'enviando' -> 'pendente' para disparo imediato.`);
    }
  } catch (err) {
    console.error('[Socket] Erro ao recuperar agendamentos no connect:', err);
  }

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    usuariosConectados.delete(socket.id);
  });
});

// Seed de Usuário Admin inicial caso o banco esteja vazio
async function seedAdmin() {
  try {
    const usuariosCount = await prisma.usuario.count();
    if (usuariosCount === 0) {
      await prisma.usuario.create({
        data: {
          nome: 'Administrador Master',
          email: 'admin@crm.com',
          senha: 'admin123',
          role: 'admin'
        }
      });
      console.log('[Prisma Seed] Usuário Admin inicial criado com sucesso: admin@crm.com / admin123');
    }
  } catch (err) {
    console.error('[Prisma Seed] Erro no seed de administrador:', err);
  }
}
// O seedAdmin() agora é chamado dentro do iniciarCoreDoSistema() para evitar falhas se o BD estiver offline.

const PORT = process.env.PORT || 3000;
// Só localhost: a partir de agora o Nginx é quem fica exposto na porta 443/80
// (termina o HTTPS e faz proxy pra cá), cuidando de múltiplos domínios/certificados.
// O Node não deve mais ser alcançável direto de fora.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Servidor rodando na porta ${PORT} (somente localhost, atrás do Nginx)`);
});
