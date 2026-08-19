import { Router } from 'express';
import { prisma } from '../server';
import { requireAuth } from '../middlewares/requireAuth';
import { connectedUsers } from '../workers/whatsappService';

// ============================================================================
// PAINEL DE ABERTURA — o que o dono precisa ver ao entrar no sistema.
//
// Uma rota só, de propósito: a tela antiga puxava dado de vários lugares e a
// Caixa de Entrada já mostrou o estrago que isso faz (232 requisições de foto
// travaram as mensagens). Aqui tudo vem junto, numa consulta por bloco.
// ============================================================================

const router = Router();
const erro = (res: any, e: any) => res.status(500).json({ error: e?.message || 'Erro' });

const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };
const hojeStr = () => new Date().toISOString().slice(0, 10);
const soDigitos = (v: unknown) => String(v || '').replace(/\D/g, '');

// Mecânico usa só o app da Garantia — não conta como quem atende no WhatsApp.
const ehMecanico = (u: { role: string; modulosPermitidos: string }) => {
  if (u.role !== 'operador') return false;
  let mods: string[] = [];
  try { const a = JSON.parse(u.modulosPermitidos || '[]'); mods = Array.isArray(a) ? a : []; } catch { mods = []; }
  return mods.length > 0 && mods.includes('garantia50k') && !mods.some((m) => String(m).startsWith('at-'));
};

router.get('/resumo', requireAuth, async (_req, res) => {
  try {
    const hoje = inicioDoDia();

    // ── Quem atende no WhatsApp (base dos blocos de atendimento e saúde) ──
    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true, externo: false },
      select: { id: true, nome: true, role: true, modulosPermitidos: true, whatsappConectado: true, whatsappDonoId: true, lojaId: true },
    });
    const atendentes = usuarios.filter((u) => !ehMecanico(u) && !['admin', 'master'].includes(u.role));
    const conectado = (u: typeof atendentes[number]) =>
      u.whatsappDonoId ? connectedUsers.has(u.whatsappDonoId) : !!u.whatsappConectado;

    const lojas = await prisma.loja.findMany({ select: { id: true, store_name: true } });
    const nomeLoja: Record<string, string> = Object.fromEntries(lojas.map((l) => [l.id, l.store_name]));

    // ── 1. ATENDIMENTO DE HOJE ──
    // "Chegaram" = clientes distintos que mandaram mensagem hoje. Conta por NÚMERO real
    // (o mesmo cliente pode aparecer com jid antigo e com o @lid novo).
    const msgsHoje = await prisma.mensagem.findMany({
      where: { timestamp: { gte: hoje } },
      select: { chatJid: true, numeroReal: true, fromMe: true, usuarioId: true },
    });
    const chaveCliente = (m: { chatJid: string; numeroReal: string | null }) =>
      soDigitos(m.numeroReal) || String(m.chatJid || '').split('@')[0];

    const chegaram = new Set<string>();
    const respondidos = new Set<string>();
    msgsHoje.forEach((m) => {
      const k = chaveCliente(m);
      if (!k) return;
      if (m.fromMe) respondidos.add(k); else chegaram.add(k);
    });
    let semResposta = 0;
    chegaram.forEach((k) => { if (!respondidos.has(k)) semResposta += 1; });

    // ── 2. SAÚDE DAS LOJAS: o que precisa da sua ação hoje ──
    const desconectados = atendentes.filter((u) => !conectado(u) && !u.whatsappDonoId);
    const contas = await prisma.contaAnuncio.findMany({
      select: { id: true, nome: true, plataforma: true, saldo: true, gastoDia: true, conexao_id: true },
    });
    const saldoBaixo = contas
      .filter((c) => {
        const saldo = Number(c.saldo || 0);
        const gasto = Number(c.gastoDia || 0);
        if (c.conexao_id && saldo <= 0) return false;         // pós-paga: não tem saldo pra acabar
        if (gasto <= 0) return saldo > 0 && saldo < 50;        // sem gasto conhecido: alerta por valor baixo
        return saldo / gasto <= 5;                             // dura 5 dias ou menos
      })
      .map((c) => ({
        nome: c.nome,
        plataforma: c.plataforma,
        saldo: Number(c.saldo || 0),
        diasRestantes: Number(c.gastoDia || 0) > 0 ? Math.floor(Number(c.saldo || 0) / Number(c.gastoDia)) : null,
      }));

    const agendamentosFalhados = await prisma.agendamento.count({
      where: { status: 'falhou', enviarEm: { gte: diasAtras(7) } },
    });

    // ── 3. GARANTIA 50K ──
    const [garantiasSemana, revisoesPendentes, notificacoesDevidas, garantiasAtivas] = await Promise.all([
      prisma.garantia.count({ where: { criadoEm: { gte: diasAtras(7) } } }),
      prisma.garantiaRevisao.count({ where: { status: 'pendente' } }),
      prisma.garantiaNotificacao.count({ where: { enviada: false, agendadaPara: { lte: hojeStr() } } }),
      prisma.garantia.count({ where: { status: 'ativa' } }),
    ]);

    // ── 4. DINHEIRO DOS ANÚNCIOS (mês corrente) ──
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const metricas = await prisma.metricaDiaria.findMany({
      where: { data: { gte: inicioMes } },
      select: { spend: true, leads: true, plataforma: true },
    });
    const investido = metricas.reduce((s, m) => s + Number(m.spend || 0), 0);
    const leads = metricas.reduce((s, m) => s + Number(m.leads || 0), 0);
    const campanhasAtivas = await prisma.campanha.count({ where: { status: 'Active' } });

    res.json({
      atendimento: {
        chegaram: chegaram.size,
        respondidos: respondidos.size,
        semResposta,
        whatsappConectados: atendentes.filter(conectado).length,
        whatsappTotal: atendentes.length,
      },
      saude: {
        whatsappCaidos: desconectados.map((u) => ({ nome: u.nome, loja: u.lojaId ? (nomeLoja[u.lojaId] || null) : null })),
        contasSaldoBaixo: saldoBaixo,
        agendamentosFalhados,
      },
      garantia: {
        ativas: garantiasAtivas,
        novasNaSemana: garantiasSemana,
        revisoesAguardando: revisoesPendentes,
        avisosDeRevisaoDevidos: notificacoesDevidas,
      },
      anuncios: {
        investidoNoMes: Math.round(investido * 100) / 100,
        contatos: leads,
        custoPorContato: leads > 0 ? Math.round((investido / leads) * 100) / 100 : null,
        campanhasAtivas,
      },
    });
  } catch (e) { erro(res, e); }
});

export default router;
