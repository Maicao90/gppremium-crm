import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { initWorker } from './workers/agendaWorker';
import agendamentosRouter from './routes/agendamentos';
import contatosRouter from './routes/contatos';
import configuracoesRouter from './routes/configuracoes';
import usuariosRouter from './routes/usuarios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
export const io = new Server(server, {
  cors: { origin: '*' }
});

export const prisma = new PrismaClient();

// Inicia Worker do BullMQ
initWorker();

// Rotas
app.use('/api/agendamentos', agendamentosRouter);
app.use('/api/contatos', contatosRouter);
app.use('/api/configuracoes', configuracoesRouter);
app.use('/api/usuarios', usuariosRouter);

// Servir a pasta pública no endpoint /admin
app.use('/admin', express.static(path.join(__dirname, '../public')));

// Rotas explícitas para garantir o carregamento do Dashboard em /admin ou /admin/
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
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
    console.log(`[Socket] Atendente ${usuarioId} registrado no socket ${socket.id}`);
    usuariosConectados.set(socket.id, String(usuarioId));
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
seedAdmin();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
