"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const CONFIG_PATH = path_1.default.join(__dirname, '..', 'config_nuvem.json');
try {
    const configs = JSON.parse(fs_1.default.readFileSync(CONFIG_PATH, 'utf-8'));
    const activeUrl = configs.planoA || configs.planoB || configs.planoC;
    if (activeUrl)
        process.env.DATABASE_URL = activeUrl;
}
catch (e) { }
// O Prisma Client aqui já foi gerado para PostgreSQL (cloud)
const prisma = new client_1.PrismaClient();
const dbPath = path_1.default.join(__dirname, '..', 'prisma', 'dev.db');
async function migrar() {
    console.log('🔄 Iniciando migração do SQLite local para o PostgreSQL na nuvem...');
    let db;
    try {
        db = new better_sqlite3_1.default(dbPath, { readonly: true });
        console.log(`✅ Banco de dados local (SQLite) aberto: ${dbPath}`);
    }
    catch (err) {
        console.error('❌ Não foi possível abrir o banco SQLite. Ele existe? Detalhes:', err.message);
        process.exit(1);
    }
    try {
        await prisma.$connect();
        console.log('✅ Conectado ao PostgreSQL (Nuvem).');
    }
    catch (err) {
        console.error('❌ Falha ao conectar no PostgreSQL. Verifique se a URL no Painel Admin (ou .env) está correta.', err.message);
        process.exit(1);
    }
    // Migrar Usuários
    const usuarios = db.prepare('SELECT * FROM Usuario').all();
    console.log(`\n⏳ Migrando ${usuarios.length} Usuários...`);
    for (const u of usuarios) {
        const existe = await prisma.usuario.findUnique({ where: { id: u.id } });
        if (!existe) {
            await prisma.usuario.create({
                data: {
                    id: u.id,
                    nome: u.nome,
                    email: u.email,
                    senha: u.senha,
                    role: u.role,
                    criadoEm: new Date(u.criadoEm)
                }
            });
            console.log(`   ➕ Usuário copiado: ${u.nome}`);
        }
    }
    // Migrar Contatos
    const contatos = db.prepare('SELECT * FROM Contato').all();
    console.log(`\n⏳ Migrando ${contatos.length} Contatos...`);
    for (const c of contatos) {
        const existe = await prisma.contato.findUnique({ where: { numero: c.numero } });
        if (!existe) {
            await prisma.contato.create({
                data: {
                    id: c.id,
                    nome: c.nome,
                    numero: c.numero,
                    criadoEm: new Date(c.criadoEm),
                    atualizadoEm: new Date(c.atualizadoEm)
                }
            });
        }
    }
    console.log(`   ➕ ${contatos.length} Contatos copiados (ou ignorados se já existiam).`);
    // Migrar Configuracao
    const configuracoes = db.prepare('SELECT * FROM Configuracao').all();
    console.log(`\n⏳ Migrando ${configuracoes.length} Configurações...`);
    for (const c of configuracoes) {
        const existe = await prisma.configuracao.findUnique({ where: { id: c.id } });
        if (!existe) {
            // Como o sqlite do prisma salva os booleanos como 1 ou 0
            const ativo = c.expedienteAtivo === 1 || c.expedienteAtivo === true;
            await prisma.configuracao.create({
                data: {
                    id: c.id,
                    expedienteAtivo: ativo,
                    expedienteInicio: c.expedienteInicio,
                    expedienteFim: c.expedienteFim,
                    expedienteDias: c.expedienteDias,
                    atualizadoEm: new Date(c.atualizadoEm)
                }
            });
        }
    }
    // Migrar Agendamentos
    const agendamentos = db.prepare('SELECT * FROM Agendamento').all();
    console.log(`\n⏳ Migrando ${agendamentos.length} Agendamentos...`);
    for (const a of agendamentos) {
        const existe = await prisma.agendamento.findUnique({ where: { id: a.id } });
        if (!existe) {
            const cancelarSeResponder = a.cancelarSeResponder === 1 || a.cancelarSeResponder === true;
            await prisma.agendamento.create({
                data: {
                    id: a.id,
                    cliente: a.cliente,
                    numero: a.numero,
                    mensagem: a.mensagem,
                    enviarEm: new Date(a.enviarEm),
                    status: a.status,
                    cancelarSeResponder: cancelarSeResponder,
                    observacoes: a.observacoes,
                    criadoPorId: a.criadoPorId,
                    criadoEm: new Date(a.criadoEm),
                    atualizadoEm: new Date(a.atualizadoEm)
                }
            });
        }
    }
    console.log(`   ➕ ${agendamentos.length} Agendamentos copiados.`);
    console.log('\n🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO! 🎉');
    console.log('Os dados foram copiados do seu PC local para a Nuvem de forma intacta.');
    db.close();
    await prisma.$disconnect();
}
migrar().catch(err => {
    console.error('Erro geral durante a migração:', err);
});
//# sourceMappingURL=migrar_dados.js.map