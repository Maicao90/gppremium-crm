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
import { connectToWhatsApp, latestQR, connectedUsers } from './workers/whatsappService';
import agendamentosRouter from './routes/agendamentos';
import contatosRouter from './routes/contatos';
import configuracoesRouter from './routes/configuracoes';
import usuariosRouter from './routes/usuarios';
import inboxRouter from './routes/inbox';
import iaRouter from './routes/ia';
import crmAnunciosRouter from './routes/crmAnuncios';
import integracoesRouter from './routes/integracoes';
import { initSyncAds } from './integracoes/syncService';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
    
    // Inicia a conexão do WhatsApp para todos os usuários que estão ativos e possivelmente conectados
    try {
      const usuarios = await prisma.usuario.findMany({ where: { ativo: true } });
      for (const user of usuarios) {
        connectToWhatsApp(user.id).catch(err => console.error(`[Baileys] Erro ao iniciar WhatsApp para ${user.id}:`, err));
      }
    } catch (err) {
      console.error('[Core] Erro ao carregar usuários para iniciar o WhatsApp:', err);
    }
    
    seedAdmin();
  } catch (err) {
    console.error('[Core] Erro ao iniciar core:', err);
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
app.use('/api/agendamentos', agendamentosRouter);
app.use('/api/contatos', contatosRouter);
app.use('/api/configuracoes', configuracoesRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/ia', iaRouter); // Assistente IA (Claude) com contexto do CRM
app.use('/api/integracoes', integracoesRouter); // integrações Google Ads / Meta Ads
app.use('/api', crmAnunciosRouter); // /api/empresas, /api/lojas, /api/campanhas, /api/contas

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
  socket.on('registrar_atendente', (usuarioId) => {
    const uid = String(usuarioId);
    console.log(`[Socket] Atendente ${uid} registrado no socket ${socket.id}`);
    usuariosConectados.set(socket.id, uid);

    // Entrar na sala do usuário
    socket.join(uid);

    // CORREÇÃO DO "AGUARDANDO QR" ETERNO:
    // Informa IMEDIATAMENTE o estado atual a esta extensão que acabou de conectar.
    // Sem isso, um QR gerado antes da extensão abrir (ex.: no boot da VPS) se perdia
    // e a tela ficava travada em "Aguardando QR Code".
    if (connectedUsers.has(uid)) {
      // Já está conectado: avisa a extensão para sair da tela de QR.
      socket.emit('WHATSAPP_STATUS', { conectado: true });
    } else if (latestQR.has(uid)) {
      // Existe um QR pendente: reenvia na hora para esta extensão.
      console.log(`[Socket] Reenviando QR Code pendente para o atendente ${uid}.`);
      socket.emit('WHATSAPP_QR_CODE', latestQR.get(uid));
    }

    // Garante que o WhatsApp está conectado ou em processo de conexão para este usuário.
    // (Se não houver sessão, cria uma nova e o QR fluirá para a sala onde a extensão já está.)
    connectToWhatsApp(uid, socket.id).catch(err => console.error(`[Baileys] Erro crítico ao conectar WhatsApp do usuário ${uid}:`, err));
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
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
