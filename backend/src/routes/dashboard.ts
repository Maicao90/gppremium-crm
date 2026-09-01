import { Router } from 'express';
import { prisma } from '../server';
import { idsAtendentesDaLoja, lojaDoUsuario } from '../auth/escopoLoja';
import { connectedUsers } from '../workers/whatsappService';

const router = Router();

const inicioDoDia = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const diasAtras = (dias: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
};

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const campanhaAtiva = (status: string | null | undefined): boolean => {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return false;
  return ['active', 'ativa', 'ativo', 'learning', 'em veiculacao', 'veiculando'].includes(s);
};

router.get('/resumo', async (req, res) => {
  try {
    const hoje = inicioDoDia();
    const ultimaSemana = diasAtras(7);
    const hojeStr = hoje.toISOString().slice(0, 10);
    const lojaId = await lojaDoUsuario(req);
    const atendentesIds = await idsAtendentesDaLoja(req);

    const whereUsuarios: any = { ativo: true, externo: false };
    if (lojaId) whereUsuarios.lojaId = lojaId;

    const usuarios = await prisma.usuario.findMany({
      where: whereUsuarios,
      select: { id: true, nome: true, lojaId: true, whatsappDonoId: true },
      orderBy: { nome: 'asc' },
    });

    const conexoesReais = usuarios.filter((u) => !u.whatsappDonoId);
    const lojasIds = [...new Set(conexoesReais.map((u) => u.lojaId).filter(Boolean) as string[])];
    const lojas = lojasIds.length
      ? await prisma.loja.findMany({ where: { id: { in: lojasIds } }, select: { id: true, store_name: true } })
      : [];
    const lojaNomePorId: Record<string, string> = {};
    lojas.forEach((l) => { lojaNomePorId[l.id] = l.store_name; });

    const whatsappCaidos = conexoesReais
      .filter((u) => !connectedUsers.has(u.id))
      .map((u) => ({
        nome: u.nome,
        loja: u.lojaId ? (lojaNomePorId[u.lojaId] || 'Sem loja definida') : 'Sem loja definida',
      }));

    const whereMensagens: any = { timestamp: { gte: hoje } };
    if (atendentesIds) {
      whereMensagens.usuarioId = atendentesIds.length ? { in: atendentesIds } : '__sem_resultado__';
    }

    const mensagensHoje = await prisma.mensagem.findMany({
      where: whereMensagens,
      select: { chatJid: true, fromMe: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    });

    const mapaConversas = new Map<string, { inbound?: Date; outbound?: Date }>();
    for (const msg of mensagensHoje) {
      const atual = mapaConversas.get(msg.chatJid) || {};
      if (msg.fromMe) atual.outbound = msg.timestamp;
      else atual.inbound = msg.timestamp;
      mapaConversas.set(msg.chatJid, atual);
    }

    let chegaram = 0;
    let respondidos = 0;
    let semResposta = 0;
    for (const conversa of mapaConversas.values()) {
      if (!conversa.inbound) continue;
      chegaram++;
      if (conversa.outbound && conversa.outbound >= conversa.inbound) respondidos++;
      else semResposta++;
    }

    const whereGarantiaBase: any = lojaId ? { lojaId } : {};
    const whereRevisaoBase: any = lojaId ? { lojaId } : {};

    let whereContaBase: any = {};
    let whereCampanhaBase: any = {};
    let garantiaIdsDaLoja: string[] | null = null;
    if (lojaId) {
      const [conexoesAds, garantiasLoja] = await Promise.all([
        prisma.conexaoAds.findMany({ where: { store_id: lojaId }, select: { id: true } }),
        prisma.garantia.findMany({ where: { lojaId }, select: { id: true } }),
      ]);
      whereContaBase = { conexao_id: { in: conexoesAds.map((c) => c.id) } };
      whereCampanhaBase = { store_id: lojaId };
      garantiaIdsDaLoja = garantiasLoja.map((g) => g.id);
    }

    const [
      contas,
      campanhas,
      agendamentosFalhados,
      garantiasAtivas,
      garantiasNovasNaSemana,
      revisoesAguardando,
      notificacoesDevidas,
    ] = await Promise.all([
      prisma.contaAnuncio.findMany({
        where: whereContaBase,
        select: { nome: true, saldo: true, gastoDia: true, gastoMes: true, limiteAlerta: true },
      }),
      prisma.campanha.findMany({
        where: whereCampanhaBase,
        select: { status: true, spend: true, leads: true },
      }),
      prisma.agendamento.count({
        where: {
          status: 'falhou',
          criadoEm: { gte: ultimaSemana },
          ...(atendentesIds ? { criadoPorId: atendentesIds.length ? { in: atendentesIds } : '__sem_resultado__' } : {}),
        },
      }),
      prisma.garantia.count({ where: { ...whereGarantiaBase, status: { in: ['ativa', 'atencao'] } } }),
      prisma.garantia.count({ where: { ...whereGarantiaBase, criadoEm: { gte: ultimaSemana } } }),
      prisma.garantiaRevisao.count({ where: { ...whereRevisaoBase, status: 'pendente' } }),
      prisma.garantiaNotificacao.count({
        where: {
          enviada: false,
          agendadaPara: { lte: hojeStr },
          ...(garantiaIdsDaLoja ? { garantiaId: garantiaIdsDaLoja.length ? { in: garantiaIdsDaLoja } : '__sem_resultado__' } : {}),
        },
      }),
    ]);

    const contasSaldoBaixo = contas
      .map((c) => {
        const saldo = numero(c.saldo);
        const gastoDia = numero(c.gastoDia);
        const diasRestantes = gastoDia > 0 ? Math.floor(saldo / gastoDia) : null;
        const emAlerta = saldo <= numero(c.limiteAlerta) || (diasRestantes !== null && diasRestantes <= 3);
        return emAlerta ? { nome: c.nome, saldo, diasRestantes } : null;
      })
      .filter(Boolean);

    const investidoCampanhas = campanhas.reduce((acc, c) => acc + numero(c.spend), 0);
    const contatos = campanhas.reduce((acc, c) => acc + Math.max(0, Number(c.leads) || 0), 0);
    const investidoContas = contas.reduce((acc, c) => acc + numero(c.gastoMes), 0);
    const investidoNoMes = investidoCampanhas > 0 ? investidoCampanhas : investidoContas;

    res.json({
      atendimento: {
        chegaram,
        respondidos,
        semResposta,
        whatsappConectados: conexoesReais.filter((u) => connectedUsers.has(u.id)).length,
        whatsappTotal: conexoesReais.length,
      },
      saude: {
        whatsappCaidos,
        contasSaldoBaixo,
        agendamentosFalhados,
      },
      garantia: {
        ativas: garantiasAtivas,
        novasNaSemana: garantiasNovasNaSemana,
        revisoesAguardando,
        avisosDeRevisaoDevidos: notificacoesDevidas,
      },
      anuncios: {
        investidoNoMes,
        contatos,
        custoPorContato: contatos > 0 ? investidoNoMes / contatos : 0,
        campanhasAtivas: campanhas.filter((c) => campanhaAtiva(c.status)).length,
      },
    });
  } catch (error: any) {
    console.error('Erro ao montar resumo do painel:', error);
    res.status(500).json({ error: error?.message || 'Erro ao montar resumo do painel.' });
  }
});

export default router;
