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
import { initDisparoWorker } from './workers/disparoWorker';
import { connectToWhatsApp, latestQR, connectedUsers, carregarPausadosDoBanco, resolverConexaoEfetiva } from './workers/whatsappService';
import { marcarPresencaExtensao } from './services/presencaExtensao';
import agendamentosRouter from './routes/agendamentos';
import extensionLogsRouter from './routes/extensionLogs';
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
import fluxoRouter from './routes/fluxo';
import dashboardRouter from './routes/dashboard';
import disparoRouter from './routes/disparo';
import garantiaRouter from './routes/garantia';
import garantiaAppRouter from './routes/garantiaApp';
import olxRouter from './routes/olx';
import { iniciarMonitorOlx } from './workers/olxWorker';
import { iniciarCentralTrafego } from './central/comandos';
import { seedAnuncios } from './seedAnuncios';
import { seedStoresAndUsers } from './seedStoresAndUsers';
import { initGarantiaPush } from './workers/garantiaPush';
import { paginaLinkPublica } from './middlewares/paginaLinkPublica';
import { initSyncAds } from './integracoes/syncService';
import { requireAuth } from './middlewares/requireAuth';
import { requireModulo, requireAnyModulo } from './middlewares/requireModulo';
import { authOpcional, authWhatsapp } from './middlewares/requireAuth';
import { hashSenha } from './auth/senha';

dotenv.config();

const app = express();
app.set('etag', false); // API dinamica: sem isso, respostas identicas viram 304 sem corpo e o front confunde com erro
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
    initDisparoWorker(); // robô de disparo automático inteligente (30/dia entre 08:00 e 17:00)
    iniciarCentralTrafego(); // Central de Trafego via WhatsApp (relatorio 8h, comandos, alertas de saldo)
    initSyncAds(); // sincronização periódica de Google Ads / Meta Ads
    initGarantiaPush(); // envio de push das notificações de garantia (cliente com app)
    iniciarMonitorOlx(); // monitor e watchdog de anúncios e chat da OLX
    
    // Restaura do banco quem estava PAUSADO antes deste restart (senão o vigia
    // reconecta sozinho e gera QR infinito de contas que pedimos pra não mexer).
    await carregarPausadosDoBanco();

    // Inicia a conexão do WhatsApp para todos os usuários que estão ativos e possivelmente conectados
    try {
      const usuarios = await prisma.usuario.findMany({ where: { ativo: true } });
      let atraso = 0;
      for (const user of usuarios) {
        setTimeout(() => {
          connectToWhatsApp(user.id, undefined, undefined, true).catch(err => console.error(`[Baileys] Erro ao iniciar WhatsApp para ${user.id}:`, err));
        }, atraso).unref?.();
        atraso += 700;
      }
    } catch (err) {
      console.error('[Core] Erro ao carregar usuários para iniciar o WhatsApp:', err);
    }
    
    await seedAdmin();
    await migrarSenhas();
    await ensureMaster();
    await seedStoresAndUsers();
    await seedAnuncios();
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

// Servir arquivos estáticos da pasta public/ com no-cache para HTML
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, pathUrl) => {
    if (pathUrl.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Rota raiz (redireciona para o painel principal em /anuncios/)
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.redirect('/anuncios/');
});

// Painel legado completo HTML
app.get('/admin-legacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-legacy.html'));
});
app.get('/legacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-legacy.html'));
});

// Rota para o painel de credenciais de nuvem (redirecionado para o novo painel)
app.use('/admin', (req, res) => res.redirect('/anuncios/'));
app.get('/admin.html', (req, res) => res.redirect('/anuncios/'));

// SPA Fallback para o novo painel em /anuncios/ (com no-cache para garantir atualização imediata)
app.get(/^\/anuncios(\/.*)?$/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/anuncios/index.html'));
});

// Rotas de API
// Rotas de WhatsApp/atendimento: authOpcional popula req.user quando há token
// (gerente no painel → escopado por loja dentro dos handlers), MAS não bloqueia
// quem chega sem token (a extensão dos atendentes continua funcionando igual).
app.use('/api/extension-logs', extensionLogsRouter); // sem auth: extensao manda log antes de logar
app.use('/api/agendamentos', authWhatsapp, agendamentosRouter);
app.use('/api/contatos', authWhatsapp, contatosRouter);
app.use('/api/configuracoes', configuracoesRouter);
// login é público; as escritas de usuário exigem master (requireMaster dentro do router).
app.use('/api/usuarios', authOpcional, usuariosRouter);
app.use('/api/inbox', authWhatsapp, inboxRouter);
// Bot Pneus (Charles) — proxy pro pneus-bot da Vercel.
// ⚠️ VAZAMENTO CORRIGIDO 03/08/2026: esta rota subia com `authWhatsapp`, que só exige
// token quando WHATSAPP_REQUIRE_AUTH=true — e essa env NÃO existe na VPS. Na prática
// caía em authOpcional, que NÃO bloqueia: qualquer pessoa na internet chamava
// /api/bot-pneus/resumo sem login e recebia 200 com telefone, status e resumo de
// conversa dos clientes, mais a tabela de preços e o prompt inteiro em /config.
// Era a única rota sensível do painel sem requireModulo. Agora segue o mesmo padrão
// das outras (disparo, garantia): exige login E o módulo do Bot Pneus.
app.use('/api/bot-pneus', requireAuth, requireModulo('at-botpneus'), botPneusRouter);
app.use('/api/fluxo', requireAuth, requireModulo('at-fluxo'), fluxoRouter); // Tela "Fluxo": mapa do atendimento + edicao dos textos
app.use('/api/dashboard', requireAuth, requireModulo('dashboard'), dashboardRouter);
// Ferramentas 100% do painel de anúncios: enforce no servidor (gerente sem esses módulos → 403).
app.use('/api/ia', requireAuth, requireModulo('assistant'), iaRouter); // Assistente IA (Claude)
app.use('/api/integracoes', requireAuth, requireAnyModulo(['dashboard', 'otimizador']), integracoesRouter); // Google/Meta Ads
app.use('/api', crmAnunciosRouter); // /api/empresas, /api/lojas, /api/campanhas, /api/contas (gate por loja: Fase 2)
app.use('/api/paginalinks', requireAuth, requireModulo('linkbio'), paginaLinksRouter); // Link na Bio
app.use('/api/otimizador', requireAuth, requireModulo('otimizador'), otimizadorAdsRouter); // Otimizador
app.use('/api/disparo', requireAuth, requireModulo('at-disparo'), disparoRouter); // Disparo manual WhatsApp (Direcional)
app.use('/api/garantia', requireAuth, requireModulo('garantia50k'), garantiaRouter); // Garantia 50.000 KM (painel + app do mecânico, login CRM)
app.use('/api/garantia-app', garantiaAppRouter); // App do CLIENTE final (auth própria por CPF+senha, cada rota se protege)
app.use('/api/olx', (req, res, next) => (req.path.startsWith('/webhook') ? next() : requireAuth(req, res, () => {
  const mods: string[] = Array.isArray((req as any).user?.modulos) ? (req as any).user.modulos : [];
  const papel = String((req as any).user?.role || '');
  if (papel === 'admin' || mods.includes('olx-anuncios') || mods.includes('olx-chat')) return next();
  return res.status(403).json({ error: 'Sem acesso ao módulo OLX.' });
})), olxRouter); // Módulo OLX: Anúncios, Watchdog e Chat Integrado

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
  socket.on('registrar_atendente', async (usuarioId, versaoExtensao) => {
    const uid = String(usuarioId);
    marcarPresencaExtensao(uid, versaoExtensao);
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
      // Só a imagem (data URL): a extensão faz <img src={qr}> — o objeto inteiro deixava o QR em BRANCO (24/09).
      socket.emit('WHATSAPP_QR_CODE', latestQR.get(efetivoId)?.qrCode);
    }

    // Fluxo da EXTENSÃO: se este atendente ainda não tem sessão registrada, o QR deve
    // nascer automaticamente aqui. O bloqueio "aguardando conexão com o servidor" na
    // extensão depende disso; deixar somente no fluxo manual do painel faz parceiros
    // externos e contas novas ficarem travados sem nunca receber QR.
    // Achado 01/09: essa chamada era INCONDICIONAL — toda vez que a extensao
    // (re)carregava no navegador (F5, PC saindo do modo espera, etc.), o servidor
    // tentava conectar de novo MESMO com o usuario ja conectado. Quase sempre o
    // guard interno do connectToWhatsApp ("sessao ja existe") pegava e vinha um
    // no-op, mas em pelo menos 2 casos reais (Alan e Ana Paula, 01/09) essa segunda
    // tentativa venceu a corrida e abriu uma conexao concorrente — o WhatsApp viu
    // dois "aparelhos" disputando a mesma sessao e derrubou uma com erro 440
    // (conflict/replaced), as vezes apagando a sessao de vez. Agora so tenta
    // conectar quando a pessoa realmente NAO esta conectada.
    if (!connectedUsers.has(efetivoId)) {
      connectToWhatsApp(efetivoId, socket.id, undefined, true).catch(err => console.error(`[Baileys] Erro crítico ao conectar WhatsApp do usuário ${efetivoId}:`, err));
    }
  });

  // Painel admin: "assistir" a caixa de entrada de um atendente (entra na sala para
  // receber NOVA_MENSAGEM em tempo real, SEM os efeitos do registrar_atendente).
  socket.on('assistir_atendente', (usuarioId) => {
    const uid = String(usuarioId);
    socket.join(uid);
    
    // Envia o estado atual para o painel (QR ou status), pois o painel precisa 
    // exibir o QR code se ele já estiver gerado.
    resolverConexaoEfetiva(uid).then(efetivoId => {
      if (connectedUsers.has(efetivoId)) {
        socket.emit('WHATSAPP_STATUS', { conectado: true });
      } else if (latestQR.has(efetivoId)) {
        socket.emit('WHATSAPP_QR_CODE', latestQR.get(efetivoId)?.qrCode);
      }
    }).catch(e => console.error(e));
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

let portaAtual = Number(process.env.PORT && process.env.PORT !== '443' ? process.env.PORT : 3001) || 3001;

function tentarOuvirPorta(p: number) {
  server.listen(p, () => {
    console.log(`[Servidor] Rodando com sucesso na porta ${p} (somente localhost, atrás do Nginx)`);
  });
}

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Porta] Porta ${portaAtual} em uso. Tentando próxima porta (${portaAtual + 1})...`);
    portaAtual++;
    setTimeout(() => {
      tentarOuvirPorta(portaAtual);
    }, 300);
  } else {
    console.error('[Servidor] Erro de rede:', err);
  }
});

tentarOuvirPorta(portaAtual);
