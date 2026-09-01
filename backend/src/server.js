"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosConectados = exports.prisma = exports.io = void 0;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const agendaWorker_1 = require("./workers/agendaWorker");
const whatsappService_1 = require("./workers/whatsappService");
const agendamentos_1 = __importDefault(require("./routes/agendamentos"));
const contatos_1 = __importDefault(require("./routes/contatos"));
const configuracoes_1 = __importDefault(require("./routes/configuracoes"));
const usuarios_1 = __importDefault(require("./routes/usuarios"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// Lógica de boot em HTTPS nativo seguro
let server;
try {
    const keyPath = path_1.default.join(__dirname, '../key.pem');
    const certPath = path_1.default.join(__dirname, '../cert.pem');
    if (fs_1.default.existsSync(keyPath) && fs_1.default.existsSync(certPath)) {
        const options = {
            key: fs_1.default.readFileSync(keyPath),
            cert: fs_1.default.readFileSync(certPath)
        };
        server = https_1.default.createServer(options, app);
        console.log('[SSL] Iniciando servidor em modo seguro HTTPS (SSL nativo)!');
    }
    else {
        server = http_1.default.createServer(app);
        console.log('[SSL] Chaves SSL não encontradas. Iniciando em modo padrão HTTP.');
    }
}
catch (e) {
    server = http_1.default.createServer(app);
    console.log('[SSL] Falha ao configurar SSL. Iniciando em modo padrão HTTP.');
}
exports.io = new socket_io_1.Server(server, {
    cors: { origin: '*' }
});
// Integração com Failover Multi-Cloud
const cloudManager_1 = require("./cloudManager");
// Exporta um proxy que intercepta as chamadas para o Prisma
// Isso garante que todos os arquivos (whatsappService, agendaWorker, rotas)
// sempre usem a instância mais recente do Prisma, que pode mudar caso ocorra um Failover.
exports.prisma = new Proxy({}, {
    get(target, prop) {
        return cloudManager_1.cloudManager.getPrisma()[prop];
    }
});
let coreIniciado = false;
async function iniciarCoreDoSistema() {
    if (coreIniciado)
        return;
    try {
        // Tenta acessar o banco só para garantir que subiu
        await exports.prisma.configuracao.count();
        coreIniciado = true;
        console.log('[Core] Iniciando workers principais...');
        (0, agendaWorker_1.initWorker)();
        (0, whatsappService_1.connectToWhatsApp)().catch(err => console.error('[Baileys] Erro crítico ao iniciar WhatsApp:', err));
        seedAdmin();
    }
    catch (err) {
        console.error('[Core] Erro ao iniciar core:', err);
    }
}
// Inicia o Failover no boot
cloudManager_1.cloudManager.initializeFailover().then(({ ativo }) => {
    if (ativo) {
        iniciarCoreDoSistema();
    }
    else {
        console.warn('\n======================================================');
        console.warn('BANCO DE DADOS NÃO CONFIGURADO OU FORA DO AR!');
        console.warn('O sistema principal está pausado.');
        console.warn('Acesse: http://localhost:3000/admin para configurar.');
        console.warn('======================================================\n');
    }
});
// Servir arquivos estáticos da pasta public/ (admin.html, admin/index.html, etc.)
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// Rota explícita para o painel admin principal
app.get('/admin.html', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/admin.html'));
});
// Rota para o painel de credenciais de nuvem
app.use('/admin', express_1.default.static(path_1.default.join(__dirname, '../public/admin')));
app.get('/admin', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/admin/index.html'));
});
// Rotas de API
app.use('/api/agendamentos', agendamentos_1.default);
app.use('/api/contatos', contatos_1.default);
app.use('/api/configuracoes', configuracoes_1.default);
app.use('/api/usuarios', usuarios_1.default);
// Rotas da API de Nuvem do Painel Admin
app.get('/api/admin/nuvem', (req, res) => {
    const configs = cloudManager_1.cloudManager.getConfigs();
    const ativo = cloudManager_1.cloudManager.getAtivo();
    res.json({ ...configs, ativo });
});
app.post('/api/admin/nuvem', async (req, res) => {
    try {
        const { planoA, planoB, planoC } = req.body;
        await cloudManager_1.cloudManager.saveConfigs({ planoA, planoB, planoC });
        const { ativo } = await cloudManager_1.cloudManager.initializeFailover();
        if (ativo) {
            iniciarCoreDoSistema();
            res.json({ success: true, ativo });
        }
        else {
            res.status(400).json({ error: 'Nenhuma das URLs fornecidas conseguiu conectar.' });
        }
    }
    catch (err) {
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
    }
    else if (nivel === 'warn') {
        console.warn(`\x1b[33m${timestamp} ${prefixo} ⚠️ ${mensagem}\x1b[0m`);
    }
    else {
        console.log(`\x1b[36m${timestamp} ${prefixo} ℹ️ ${mensagem}\x1b[0m`);
    }
    res.sendStatus(200);
});
// Mapeamento global de sockets conectados por atendente
exports.usuariosConectados = new Map(); // socket.id -> usuarioId
exports.io.on('connection', async (socket) => {
    console.log('Cliente conectado:', socket.id);
    // Registra atendente ativo no socket conectado
    socket.on('registrar_atendente', (usuarioId) => {
        console.log(`[Socket] Atendente ${usuarioId} registrado no socket ${socket.id}`);
        exports.usuariosConectados.set(socket.id, String(usuarioId));
    });
    // Quando a extensão se conecta (WhatsApp Web abriu), recupera IMEDIATAMENTE 
    // todos os agendamentos que porventura estejam no status 'enviando' de volta para 'pendente'
    // para que o worker os envie instantaneamente no próximo ciclo, sem atrasos.
    try {
        const recuperados = await exports.prisma.agendamento.updateMany({
            where: { status: 'enviando' },
            data: { status: 'pendente' }
        });
        if (recuperados.count > 0) {
            console.log(`[Socket] Conectado! Recuperados instantaneamente ${recuperados.count} agendamento(s) 'enviando' -> 'pendente' para disparo imediato.`);
        }
    }
    catch (err) {
        console.error('[Socket] Erro ao recuperar agendamentos no connect:', err);
    }
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        exports.usuariosConectados.delete(socket.id);
    });
});
// Seed de Usuário Admin inicial caso o banco esteja vazio
async function seedAdmin() {
    try {
        const usuariosCount = await exports.prisma.usuario.count();
        if (usuariosCount === 0) {
            await exports.prisma.usuario.create({
                data: {
                    nome: 'Administrador Master',
                    email: 'admin@crm.com',
                    senha: 'admin123',
                    role: 'admin'
                }
            });
            console.log('[Prisma Seed] Usuário Admin inicial criado com sucesso: admin@crm.com / admin123');
        }
    }
    catch (err) {
        console.error('[Prisma Seed] Erro no seed de administrador:', err);
    }
}
// O seedAdmin() agora é chamado dentro do iniciarCoreDoSistema() para evitar falhas se o BD estiver offline.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
//# sourceMappingURL=server.js.map