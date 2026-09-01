"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const server_1 = require("../server");
const router = (0, express_1.Router)();
// Rota de login
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
        }
        const usuario = await server_1.prisma.usuario.findUnique({
            where: { email: email.toLowerCase().trim() }
        });
        if (!usuario || usuario.senha !== senha) {
            return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        }
        // Retorna o usuário autenticado sem expor a senha por completo se preferir, 
        // mas retornaremos o objeto normal para simplicidade local.
        const { senha: _, ...usuarioDados } = usuario;
        res.json(usuarioDados);
    }
    catch (error) {
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
        const existente = await server_1.prisma.usuario.findUnique({
            where: { email: emailLimpo }
        });
        if (existente) {
            return res.status(400).json({ error: 'E-mail já está sendo utilizado.' });
        }
        const novoUsuario = await server_1.prisma.usuario.create({
            data: {
                nome,
                email: emailLimpo,
                senha,
                role: role || 'operador'
            }
        });
        const { senha: _, ...usuarioDados } = novoUsuario;
        res.status(201).json(usuarioDados);
    }
    catch (error) {
        console.error('Erro ao cadastrar usuário:', error);
        res.status(500).json({ error: 'Erro ao cadastrar operador' });
    }
});
// Listar todos os usuários
router.get('/', async (req, res) => {
    try {
        const usuarios = await server_1.prisma.usuario.findMany({
            select: {
                id: true,
                nome: true,
                email: true,
                role: true,
                criadoEm: true
            },
            orderBy: { nome: 'asc' }
        });
        res.json(usuarios);
    }
    catch (error) {
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
        }
        else if (periodo === 'semana') {
            dataInicio.setDate(agora.getDate() - 7);
            dataInicio.setHours(0, 0, 0, 0);
        }
        else if (periodo === 'mes') {
            dataInicio.setDate(agora.getDate() - 30);
            dataInicio.setHours(0, 0, 0, 0);
        }
        else if (periodo === 'ano') {
            dataInicio = new Date(agora.getFullYear(), 0, 1, 0, 0, 0, 0);
        }
        else {
            // Padrão: dia (hoje)
            dataInicio.setHours(0, 0, 0, 0);
        }
        // Busca usuários e inclui apenas os agendamentos do período selecionado
        const usuarios = await server_1.prisma.usuario.findMany({
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
                role: u.role,
                total,
                enviados,
                pendentes,
                falhados,
                conversao: total > 0 ? Math.round((enviados / total) * 100) : 0
            };
        });
        res.json(metricas);
    }
    catch (error) {
        console.error('Erro ao buscar métricas de usuários:', error);
        res.status(500).json({ error: 'Erro ao processar métricas.' });
    }
});
exports.default = router;
//# sourceMappingURL=usuarios.js.map