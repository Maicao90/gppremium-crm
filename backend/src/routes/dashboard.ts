import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../server';
import { idsAtendentesDaLoja, lojaDoUsuario } from '../auth/escopoLoja';
import { connectedUsers } from '../workers/whatsappService';
import { JIDS_INTERNOS, PADRAO_FORNECEDOR, numerosInternos, inicioDasAutoRespostas, TAMANHO_INICIO_AUTO } from '../services/contatosInternos';

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

// /resumo = painel ANTIGO. Mantido igual (compatibilidade); o painel novo usa /painel (abaixo).
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

    // Achado 18/09: contas administrativas/utilitarias (Administrador Master, Conta
    // Demonstracao, conta pessoal do dev) nao tem loja vinculada e nunca vao ter WhatsApp
    // conectado de proposito — apareciam aqui como se fossem "loja desconectada", o que nao
    // fazia sentido ("Precisa de voce hoje" alertando pra contas que nunca vao conectar).
    // So conta como alerta real quem esta de fato vinculado a uma loja.
    const whatsappCaidos = conexoesReais
      .filter((u) => !!u.lojaId)
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

// ============================================================================
// PAINEL NOVO (28/10, aprovado pelo dono) — GET /api/dashboard/painel?periodo=&loja=
// periodo: hoje | 7d | mes (padrão) | mes_passado — dias no fuso de Brasília.
// loja: 'todas' (padrão) ou o id de uma loja. Gerente fica SEMPRE preso à própria loja.
// Diagnóstico que motivou a troca (o /resumo acima): "investido no mês" somava Campanha.spend
// (janela de 90 dias + pausadas = R$100k quando o real de outubro era ~R$25k); WhatsApp caído
// contava mecânico/teste/demo; saldo acabando usava conta travada; "hoje" era dia UTC e
// misturava robô com equipe. Aqui: gasto/conversões SÓ de MetricaDiaria (por dia, por conexão),
// alertas só do que é real e com data de atualização, robô separado da equipe.
// Só LEITURA no banco.
// ============================================================================

type PeriodoId = 'hoje' | '7d' | 'mes' | 'mes_passado';
const PERIODOS: Record<PeriodoId, string> = { hoje: 'Hoje', '7d': 'Últimos 7 dias', mes: 'Mês atual', mes_passado: 'Mês passado' };
const FUSO = 'America/Sao_Paulo';
const UM_DIA = 86400000;
const DIAS_CONTATO_FREQUENTE = 6; // mesma regra da Caixa de Entrada/Métricas (6+ dias em 30 = equipe/parceiro, não cliente)
const MIN_SEM_RESPOSTA = 15;
const SALDO_ZERADO = 5; // R$ — abaixo disso a conta já não roda anúncio
// Assinatura que a extensão põe nas mensagens: "*Nome:*" (ou "*Nome*") — mesmo formato da Caixa de Entrada
// (/^\*(.+?):?\*/). O SQL devolve o trecho entre o 1º e o 2º "*"; aqui confere o resto (sem quebra de linha, 2–40).
const assinaturaValida = (bruta: string | null | undefined): string => {
  const s = String(bruta || '').replace(/:\s*$/, '').trim();
  return s.length >= 2 && s.length <= 40 && !/\n/.test(s) ? s : '';
};

const diaBR = (t: Date | number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const somaDias = (dia: string, n: number): string => {
  const [y, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Brasil não tem horário de verão desde 2019: meia-noite de Brasília = 03:00 UTC.
const inicioBR = (dia: string): Date => new Date(`${dia}T00:00:00-03:00`);
const diaUTC = (dia: string): Date => new Date(`${dia}T00:00:00Z`); // MetricaDiaria.data = meia-noite UTC do dia
const pad2 = (n: number) => String(n).padStart(2, '0');
const r2 = (v: number) => Math.round(v * 100) / 100;
const normalizarNome = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function janelaDoPeriodo(p: PeriodoId, agora = Date.now()) {
  const hoje = diaBR(agora);
  const [y, m] = hoje.split('-').map(Number) as [number, number];
  let de = hoje;
  let ate = hoje;
  if (p === '7d') de = somaDias(hoje, -6);
  else if (p === 'mes') de = `${y}-${pad2(m)}-01`;
  else if (p === 'mes_passado') {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    de = `${py}-${pad2(pm)}-01`;
    ate = new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10);
  }
  const ini = inicioBR(de);
  const fim = inicioBR(somaDias(ate, 1));
  return { id: p, rotulo: PERIODOS[p], de, ate, hoje, ini, fim, fimEfetivo: new Date(Math.min(fim.getTime(), agora)) };
}

const ROTULO_PAUSA: Record<string, string> = {
  eco_externo: 'Atendente respondeu pelo celular/extensão',
  atendimento_manual: 'Pausada no painel (atendente assumiu)',
  transferencia_humana: 'Robô passou para atendente',
  fora_da_lista: 'Medida fora da tabela (foi p/ atendente)',
  curriculo: 'Currículo / vaga de emprego',
  anti_loop_volume: 'Trava anti-loop (mensagens demais)',
  spam_bot_a_bot: 'Outro robô do outro lado',
};

// Mecânico = operador que só tem o módulo da garantia (app da oficina, sem WhatsApp).
const ehSoGarantia = (modulos: string): boolean => {
  try {
    const m = JSON.parse(modulos || '[]');
    return Array.isArray(m) && m.length > 0 && m.every((x) => x === 'garantia50k');
  } catch { return false; }
};

const cachePainel = new Map<string, { t: number; dados: any }>();
const CACHE_MS = 60 * 1000;

export async function montarPainel(periodoId: PeriodoId, lojaFiltro: string | null, podeTrocarLoja: boolean) {
  const agora = Date.now();
  const P = janelaDoPeriodo(periodoId, agora);

  const [lojasTodas, usuarios, conexoes] = await Promise.all([
    prisma.loja.findMany({ select: { id: true, store_name: true }, orderBy: { store_name: 'asc' } }),
    prisma.usuario.findMany({
      select: {
        id: true, nome: true, role: true, ativo: true, externo: true, demo: true, lojaId: true,
        whatsappDonoId: true, whatsappPausado: true, botIaAtivo: true, modulosPermitidos: true,
      },
    }),
    prisma.conexaoAds.findMany({
      select: { id: true, plataforma: true, nome: true, store_id: true, ativo: true, ultimaSync: true, ultimoErro: true },
    }),
  ]);

  const lojas = lojaFiltro ? lojasTodas.filter((l) => l.id === lojaFiltro) : lojasTodas;
  const lojaIds = lojas.map((l) => l.id);
  const nomeLoja: Record<string, string> = Object.fromEntries(lojasTodas.map((l) => [l.id, l.store_name]));
  // Usuários "da loja" pra contar WhatsApp/agendamentos: qualquer um que não é parceiro externo (inclui
  // inativos, pra não sumir histórico de quem saiu). Externo (parceiro da extensão) fica fora das lojas.
  const daLoja = usuarios.filter((u) => !u.externo && !!u.lojaId && lojaIds.includes(u.lojaId));
  const ids = daLoja.map((u) => u.id);
  const usuarioPorId = Object.fromEntries(usuarios.map((u) => [u.id, u]));
  const lojaDoUsuarioId = (id: string | null | undefined) => (id ? usuarioPorId[id]?.lojaId ?? null : null);

  const conexoesDaLoja = conexoes.filter((c) => !!c.store_id && lojaIds.includes(c.store_id));
  const conexaoIds = conexoesDaLoja.map((c) => c.id);
  const conexaoPorId = Object.fromEntries(conexoes.map((c) => [c.id, c]));

  const internos = [...(await numerosInternos())];
  const autos = await inicioDasAutoRespostas();

  // ── Mensagens (SQL só leitura). Base = mensagens de conversas de CLIENTE (sem grupo, status@broadcast,
  // canal, mensagem de sistema), dos números das lojas filtradas. Números compartilhados (Ana+Marina,
  // Camila+Alan, Daniel+Diogo, José+Edna) gravam a mesma conversa em 2 sessões → tudo é contado por
  // (loja, conversa) e mensagem por waId, nunca por sessão.
  const desdeBase = new Date(Math.min(P.ini.getTime(), P.fimEfetivo.getTime() - 30 * UM_DIA));
  const freqDe = new Date(P.fimEfetivo.getTime() - 30 * UM_DIA);
  const limite15 = new Date(agora - MIN_SEM_RESPOSTA * 60000);
  // Desempenho (medido em produção, 93 mil mensagens/30 dias): regex por linha custava ~2 s. Por isso a
  // assinatura sai por split_part (só em texto que começa com "*") e a boas-vindas só roda o regexp_replace
  // quando os 2 primeiros caracteres já batem; o teste de equipe/fornecedor roda 1x por conversa, não por mensagem.
  const autos2 = autos.map((a) => Array.from(a).slice(0, 2).join(''));
  const preAuto = autos2.length && autos2.every((a) => a.length === 2 && !/\s/.test(a))
    ? Prisma.sql`left(btrim(COALESCE(m."texto", '')), 2) = ANY(${autos2}::text[])`
    : Prisma.sql`true`;
  const sqlCtes = Prisma.sql`
    base AS MATERIALIZED (
      SELECT m."usuarioId", u."lojaId" AS loja, m."chatJid", m."fromMe", m."timestamp" AS ts, m."enviadoPorId",
             COALESCE(m."waId", m.id) AS chave, m."numeroReal",
             CASE WHEN NOT m."fromMe" THEN NULLIF(m."chatNome", '') END AS nome,
             CASE WHEN m."fromMe" AND left(m."texto", 1) = '*' AND position('*' in substr(left(m."texto", 60), 2)) > 0
                  THEN lower(split_part(substr(left(m."texto", 60), 2), '*', 1)) END AS ass,
             (m."fromMe" AND ${preAuto}
               AND left(regexp_replace(left(btrim(COALESCE(m."texto", '')), 80), '\\s+', ' ', 'g'), ${TAMANHO_INICIO_AUTO}::int) = ANY(${autos}::text[])) AS auto
      FROM "Mensagem" m JOIN "Usuario" u ON u.id = m."usuarioId"
      WHERE m."usuarioId" = ANY(${ids}::text[])
        AND m."timestamp" >= ${desdeBase}
        AND (m."chatJid" LIKE '%@s.whatsapp.net' OR m."chatJid" LIKE '%@lid')
        AND NOT (m."tipo" = 'outro' AND (m."midiaUrl" IS NULL OR m."midiaUrl" = '') AND m."texto" IN ('', 'protocolMessage'))
    ),
    chats AS MATERIALIZED (SELECT DISTINCT "chatJid", "numeroReal", nome FROM base),
    excluidos AS (
      -- o regex de fornecedor (com acento) custa ~40 µs por linha: só roda nos nomes que já passaram num LIKE barato
      SELECT DISTINCT d."chatJid" FROM chats d
      WHERE d."chatJid" = ANY(${JIDS_INTERNOS}::text[])
         OR regexp_replace(split_part(COALESCE(d."numeroReal", ''), ':', 1), '\\D', '', 'g') = ANY(${internos}::text[])
         OR split_part(d."chatJid", '@', 1) = ANY(${internos}::text[])
         OR (LOWER(COALESCE(d.nome, '')) LIKE ANY(ARRAY['%pe%as%', '%fornecedor%', '%distribuidora%', '%mec%nica%'])
             AND LOWER(COALESCE(d.nome, '')) ~ ${PADRAO_FORNECEDOR})
    ),
    frequentes AS (
      SELECT loja, "chatJid" FROM base
      WHERE NOT "fromMe" AND ts >= ${freqDe} AND ts < ${P.fimEfetivo}
      GROUP BY loja, "chatJid"
      HAVING COUNT(DISTINCT date_trunc('day', ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')) >= ${DIAS_CONTATO_FREQUENTE}
    )`;
  const sqlEhAuto = Prisma.sql`COALESCE(b.auto, false)`;
  const sqlCliente = Prisma.sql`NOT EXISTS (SELECT 1 FROM excluidos e WHERE e."chatJid" = b."chatJid")
        AND NOT EXISTS (SELECT 1 FROM frequentes f WHERE f.loja = b.loja AND f."chatJid" = b."chatJid")`;

  const semIds = ids.length === 0;
  const [conversasSql, esperandoSql, assinadasSql]: [any[], any[], any[]] = semIds ? [[], [], []] : await Promise.all([
    // 1) Conversas de cliente que chegaram (cliente escreveu no período), por loja
    //    (+ quantas sessões de WhatsApp receberam mensagem na loja: 2+ = número dividido entre atendentes)
    prisma.$queryRaw<Array<{ loja: string; conversas: number; sessoes: number }>>`
      WITH ${sqlCtes}
      SELECT s.loja, COALESCE(c.conversas, 0)::int AS conversas, s.sessoes
      FROM (SELECT loja, COUNT(DISTINCT "usuarioId")::int AS sessoes FROM base
            WHERE NOT "fromMe" AND ts >= ${P.ini} AND ts < ${P.fim} GROUP BY loja) s
      LEFT JOIN (SELECT b.loja, COUNT(DISTINCT b."chatJid")::int AS conversas FROM base b
            WHERE NOT b."fromMe" AND b.ts >= ${P.ini} AND b.ts < ${P.fim} AND ${sqlCliente} GROUP BY b.loja) c ON c.loja = s.loja`,
    // 2) Sem resposta: a ÚLTIMA mensagem da conversa é do cliente, chegou no período e já passou de 15 min.
    //    Boas-vindas automática não conta como resposta. Robô = número com robô ligado e conversa sem pausa.
    prisma.$queryRaw<Array<{ loja: string; chatJid: string; ts: Date; nome: string | null; robo: boolean }>>`
      WITH ${sqlCtes},
      ult AS (
        SELECT DISTINCT ON (b.loja, b."chatJid") b.loja, b."chatJid", b."usuarioId", b."fromMe", b.ts
        FROM base b
        WHERE b.ts >= ${P.ini} AND NOT ${sqlEhAuto}
        ORDER BY b.loja, b."chatJid", b.ts DESC
      ),
      nome AS (
        SELECT DISTINCT ON (loja, "chatJid") loja, "chatJid", nome
        FROM base WHERE nome IS NOT NULL
        ORDER BY loja, "chatJid", ts DESC
      )
      SELECT b.loja, b."chatJid", b.ts, n.nome,
             (COALESCE(us."botIaAtivo", false) AND (bc."pausadoAte" IS NULL OR bc."pausadoAte" <= ${new Date(agora)})) AS robo
      FROM ult b
      JOIN "Usuario" us ON us.id = b."usuarioId"
      LEFT JOIN "BotConversa" bc ON bc."usuarioId" = b."usuarioId" AND bc."chatJid" = b."chatJid"
      LEFT JOIN nome n ON n.loja = b.loja AND n."chatJid" = b."chatJid"
      WHERE NOT b."fromMe" AND b.ts < ${P.fim} AND b.ts < ${limite15} AND ${sqlCliente}
      ORDER BY b.ts DESC`,
    // 3) Mensagens da equipe (sem robô, sem IA da Meta, sem boas-vindas automática), 1 por waId,
    //    com a assinatura "*Nome:*" e a sessão que gravou. "sessao" só vem quando dá pra confiar que foi o dono
    //    do número: 1 sessão só gravou E (número sem robô OU mensagem depois que o robô passou a se marcar
    //    como 'bot' — antes de 21/10 as bolhas do robô da GP saíam sem marca e se misturavam com as da Josy).
    prisma.$queryRaw<Array<{ loja: string; env: string | null; ass: string | null; sessao: string | null; chat: string; n: number }>>`
      WITH ${sqlCtes},
      robo_desde AS (SELECT "usuarioId", MIN(ts) AS desde FROM base WHERE "enviadoPorId" = 'bot' GROUP BY 1),
      h AS (
        SELECT b.loja, b.chave, MAX(b."enviadoPorId") AS env,
               MAX(b.ass) AS ass, MIN(b.ts) AS ts,
               MAX(b."chatJid") AS chat, array_agg(DISTINCT b."usuarioId") AS sess
        FROM base b
        WHERE b."fromMe" AND b.ts >= ${P.ini} AND b.ts < ${P.fim}
          AND COALESCE(b."enviadoPorId", '') NOT IN ('bot', 'meta_ai')
          AND NOT ${sqlEhAuto}
          AND NOT EXISTS (SELECT 1 FROM excluidos e WHERE e."chatJid" = b."chatJid")
        GROUP BY b.loja, b.chave
      )
      SELECT h.loja, h.env, h.ass,
             CASE WHEN cardinality(h.sess) = 1 AND (us."botIaAtivo" IS NOT TRUE OR (rd.desde IS NOT NULL AND h.ts >= rd.desde))
                  THEN h.sess[1] END AS sessao,
             h.chat, COUNT(*)::int AS n
      FROM h
      LEFT JOIN "Usuario" us ON us.id = h.sess[1]
      LEFT JOIN robo_desde rd ON rd."usuarioId" = h.sess[1]
      GROUP BY 1, 2, 3, 4, 5`,
  ]);

  // ── Demais leituras (Prisma) ──
  const seteDiasAtras = new Date(agora - 7 * UM_DIA);
  const ontem = somaDias(P.hoje, -1);
  const [agendamentos, falhados, fluxo, fluxoMin, pausas, pausadasAgora, msgsRobo, metricas, campanhasGasto, media7d,
    contas, garantiasAtivas, garantiasNovas, garantiasPendentes, revisoesAguardando, avisosDevidos] = await Promise.all([
    ids.length ? prisma.agendamento.findMany({
      where: {
        criadoPorId: { in: ids }, status: { not: 'cancelado' },
        OR: [{ enviarEm: { gte: P.ini, lt: P.fim } }, { atualizadoEm: { gte: P.ini, lt: P.fim } }],
      },
      select: { criadoPorId: true, status: true, enviarEm: true, atualizadoEm: true, observacoes: true },
    }) : [],
    ids.length ? prisma.agendamento.findMany({
      // pelo dia em que DEVIA sair (enviarEm): o worker regrava atualizadoEm dos falhados a cada volta
      // (28/10: os 61 falhados de jun→out tinham todos atualizadoEm = hoje 14:44)
      where: { criadoPorId: { in: ids }, status: 'falhou', enviarEm: { gte: seteDiasAtras, lte: new Date(agora) } },
      select: { cliente: true, criadoPorId: true, enviarEm: true, observacoes: true },
      orderBy: { enviarEm: 'desc' },
    }) : [],
    ids.length ? prisma.fluxoEvento.findMany({
      where: { usuarioId: { in: ids }, criadoEm: { gte: P.ini, lt: P.fim } },
      select: { usuarioId: true, chatJid: true, via: true },
    }) : [],
    prisma.fluxoEvento.aggregate({ _min: { criadoEm: true } }),
    ids.length ? prisma.botConversa.findMany({
      where: { usuarioId: { in: ids }, motivoPausa: { not: null }, atualizadoEm: { gte: P.ini, lt: P.fim } },
      select: { usuarioId: true, chatJid: true, motivoPausa: true },
    }) : [],
    ids.length ? prisma.botConversa.findMany({
      where: { usuarioId: { in: ids }, pausadoAte: { gt: new Date(agora) } },
      select: { usuarioId: true, motivoPausa: true },
    }) : [],
    ids.length ? prisma.mensagem.groupBy({
      by: ['usuarioId'],
      where: { usuarioId: { in: ids }, enviadoPorId: 'bot', timestamp: { gte: P.ini, lt: P.fim } },
      _count: { _all: true },
    }) : [],
    conexaoIds.length ? prisma.metricaDiaria.groupBy({
      by: ['conexaoId'],
      where: { conexaoId: { in: conexaoIds }, data: { gte: diaUTC(P.de), lte: diaUTC(P.ate) } },
      _sum: { spend: true, leads: true, cliques: true, impressoes: true },
    }) : [],
    conexaoIds.length ? prisma.metricaDiaria.groupBy({
      by: ['conexaoId', 'campanhaExternalId'],
      where: { conexaoId: { in: conexaoIds }, data: { gte: diaUTC(P.de), lte: diaUTC(P.ate) }, spend: { gt: 0 } },
      _sum: { spend: true },
    }) : [],
    // média de gasto/dia dos últimos 7 dias FECHADOS (ontem pra trás) — o gastoDia da conta é só o de hoje até agora
    conexaoIds.length ? prisma.metricaDiaria.groupBy({
      by: ['conexaoId'],
      where: { conexaoId: { in: conexaoIds }, data: { gte: diaUTC(somaDias(ontem, -6)), lte: diaUTC(ontem) } },
      _sum: { spend: true },
    }) : [],
    prisma.contaAnuncio.findMany({ orderBy: { nome: 'asc' } }),
    prisma.garantia.count({ where: { ...(lojaFiltro ? { lojaId: { in: lojaIds } } : {}), status: { in: ['ativa', 'atencao'] } } }),
    prisma.garantia.count({ where: { ...(lojaFiltro ? { lojaId: { in: lojaIds } } : {}), criadoEm: { gte: P.ini, lt: P.fim } } }),
    prisma.garantia.count({ where: { ...(lojaFiltro ? { lojaId: { in: lojaIds } } : {}), status: 'pendente' } }),
    prisma.garantiaRevisao.count({ where: { ...(lojaFiltro ? { lojaId: { in: lojaIds } } : {}), status: 'pendente' } }),
    (async () => {
      const where: any = { enviada: false, agendadaPara: { lte: P.hoje } };
      if (lojaFiltro) {
        const gs = await prisma.garantia.findMany({ where: { lojaId: { in: lojaIds } }, select: { id: true } });
        where.garantiaId = { in: gs.map((g) => g.id) };
      }
      return prisma.garantiaNotificacao.count({ where });
    })(),
  ]);

  // ── Por loja ──
  const novaLoja = (id: string) => ({
    id, nome: nomeLoja[id] || '',
    conversas: 0,
    agendamentos: { atendente: { total: 0, enviados: 0, pendentes: 0, falhou: 0 }, robo: { total: 0, recuperacao: 0, visita: 0, enviados: 0 } },
    anuncios: { meta: { gasto: 0, conversoes: 0 }, google: { gasto: 0, conversoes: 0 }, gasto: 0, conversoes: 0, custoPorConversao: null as number | null },
    semResposta: { robo: 0, atendente: 0, ultimas24h: 0 },
    pontos: null as number | null,
  });
  const porLoja: Record<string, ReturnType<typeof novaLoja>> = Object.fromEntries(lojas.map((l) => [l.id, novaLoja(l.id)]));

  const sessoesPorLoja: Record<string, number> = {};
  for (const c of conversasSql) {
    sessoesPorLoja[c.loja] = Number(c.sessoes) || 0;
    if (porLoja[c.loja]) porLoja[c.loja]!.conversas = Number(c.conversas) || 0;
  }

  // Agendamentos: mesma régua da tela Métricas — conta no dia em que SAIU (enviado) ou no dia marcado (os outros).
  // Robô = observações "robo-..." (robo-recuperacao = remarketing automático; robo-visita = lembrete de visita).
  for (const a of agendamentos) {
    const dia = diaBR(a.status === 'enviado' ? a.atualizadoEm : a.enviarEm);
    if (dia < P.de || dia > P.ate) continue;
    const l = porLoja[lojaDoUsuarioId(a.criadoPorId) || ''];
    if (!l) continue;
    const obs = String(a.observacoes || '');
    if (obs.includes('robo-')) {
      l.agendamentos.robo.total++;
      if (obs.includes('robo-visita')) l.agendamentos.robo.visita++; else l.agendamentos.robo.recuperacao++;
      if (a.status === 'enviado') l.agendamentos.robo.enviados++;
    } else {
      const g = l.agendamentos.atendente;
      g.total++;
      if (a.status === 'enviado' || a.status === 'cliente_respondeu') g.enviados++;
      else if (a.status === 'falhou') g.falhou++;
      else g.pendentes++;
    }
  }

  // Anúncios por loja/plataforma — só MetricaDiaria (gasto real por dia).
  const plat = (p: string | null | undefined): 'meta' | 'google' => (String(p || '').toLowerCase() === 'meta' ? 'meta' : 'google');
  const porPlataforma = {
    meta: { gasto: 0, conversoes: 0, cliques: 0, impressoes: 0, campanhas: 0, custoPorConversao: null as number | null },
    google: { gasto: 0, conversoes: 0, cliques: 0, impressoes: 0, campanhas: 0, custoPorConversao: null as number | null },
  };
  for (const m of metricas as any[]) {
    const cx = conexaoPorId[m.conexaoId];
    if (!cx) continue;
    const p = plat(cx.plataforma);
    const gasto = numero(m._sum?.spend);
    const conv = numero(m._sum?.leads);
    porPlataforma[p].gasto += gasto;
    porPlataforma[p].conversoes += conv;
    porPlataforma[p].cliques += numero(m._sum?.cliques);
    porPlataforma[p].impressoes += numero(m._sum?.impressoes);
    const l = porLoja[cx.store_id || ''];
    if (l) { l.anuncios[p].gasto += gasto; l.anuncios[p].conversoes += conv; }
  }
  for (const c of campanhasGasto as any[]) {
    const cx = conexaoPorId[c.conexaoId];
    if (cx) porPlataforma[plat(cx.plataforma)].campanhas++;
  }
  for (const p of ['meta', 'google'] as const) {
    const x = porPlataforma[p];
    x.gasto = r2(x.gasto);
    x.custoPorConversao = x.conversoes > 0 ? r2(x.gasto / x.conversoes) : null;
  }

  // Sem resposta (lista)
  const esperando = (esperandoSql as any[]).map((e) => ({
    loja: e.loja, lojaNome: nomeLoja[e.loja] || '', nome: e.nome || String(e.chatJid).split('@')[0],
    desde: new Date(e.ts).toISOString(), minutos: Math.round((agora - new Date(e.ts).getTime()) / 60000), tipo: e.robo ? 'robo' : 'atendente',
  }));
  for (const e of esperando) {
    const l = porLoja[e.loja];
    if (l) {
      if (e.tipo === 'robo') l.semResposta.robo++; else l.semResposta.atendente++;
      if (e.minutos < 24 * 60) l.semResposta.ultimas24h++;
    }
  }

  // Pontos da campanha (ranking público gerado pelo cron a cada 30 min: public/ranking/dados.json)
  let pontos: any = null;
  try {
    const arq = path.resolve(__dirname, '../../public/ranking/dados.json');
    const r = JSON.parse(fs.readFileSync(arq, 'utf8'));
    const ranking: any[] = Array.isArray(r.ranking) ? r.ranking : [];
    const nomesFiltrados = new Set(lojas.map((l) => l.store_name));
    const doFiltro = lojaFiltro ? ranking.filter((x) => nomesFiltrados.has(x.loja)) : ranking;
    for (const l of Object.values(porLoja)) {
      const daquela = ranking.filter((x) => x.loja === l.nome);
      l.pontos = daquela.length ? daquela.reduce((t, x) => t + numero(x.total), 0) : null;
    }
    pontos = {
      titulo: r.titulo || 'Campanha de pontos', de: r.de, ate: r.ate, atualizadoEm: r.atualizadoEm, premios: r.premios || [], pesos: r.pesos || {},
      top: doFiltro.slice(0, 7).map((x, i) => ({
        posicao: ranking.indexOf(x) + 1 || i + 1, nome: String(x.nome || '').trim(), loja: x.loja || '', total: numero(x.total),
        agendamentos: numero(x.agendamentos), stories: numero(x.stories), google: numero(x.google),
      })),
    };
  } catch { pontos = null; }

  for (const l of Object.values(porLoja)) {
    const a = l.anuncios;
    a.meta.gasto = r2(a.meta.gasto);
    a.google.gasto = r2(a.google.gasto);
    a.gasto = r2(a.meta.gasto + a.google.gasto);
    a.conversoes = a.meta.conversoes + a.google.conversoes;
    a.custoPorConversao = a.conversoes > 0 ? r2(a.gasto / a.conversoes) : null;
  }
  const listaLojas = lojas.map((l) => porLoja[l.id]!);
  const totais = {
    conversas: listaLojas.reduce((t, l) => t + l.conversas, 0),
    agendamentosAtendente: listaLojas.reduce((t, l) => t + l.agendamentos.atendente.total, 0),
    agendamentosRobo: listaLojas.reduce((t, l) => t + l.agendamentos.robo.total, 0),
    gastoMeta: r2(porPlataforma.meta.gasto),
    gastoGoogle: r2(porPlataforma.google.gasto),
    gasto: r2(porPlataforma.meta.gasto + porPlataforma.google.gasto),
    conversoes: porPlataforma.meta.conversoes + porPlataforma.google.conversoes,
    custoPorConversao: null as number | null,
    semResposta: esperando.length,
    semResposta24h: esperando.filter((e) => e.minutos < 24 * 60).length,
    pontos: listaLojas.some((l) => l.pontos !== null) ? listaLojas.reduce((t, l) => t + (l.pontos || 0), 0) : null,
  };
  totais.custoPorConversao = totais.conversoes > 0 ? r2(totais.gasto / totais.conversoes) : null;

  // ── Alertas ──
  // WhatsApp: só quem TEM número — usuário ativo de loja, não externo/demo, não mecânico (só garantia),
  // sem conexão emprestada, e que gravou mensagem nos últimos 30 dias (prova de que existe um número ali).
  const candidatos = daLoja.filter((u) => u.ativo && !u.demo && !u.whatsappDonoId && !ehSoGarantia(u.modulosPermitidos));
  const comMsg = candidatos.length ? await prisma.mensagem.groupBy({
    by: ['usuarioId'],
    where: { usuarioId: { in: candidatos.map((u) => u.id) }, timestamp: { gte: new Date(agora - 30 * UM_DIA) } },
    _count: { _all: true },
  }) : [];
  const temNumero = new Set(comMsg.map((x) => x.usuarioId));
  const comNumero = candidatos.filter((u) => temNumero.has(u.id));
  const whatsappCaidos = comNumero.filter((u) => !connectedUsers.has(u.id))
    .map((u) => ({ id: u.id, nome: u.nome.trim(), loja: nomeLoja[u.lojaId || ''] || '', pausado: !!u.whatsappPausado }));

  // Contas de anúncio: saldo/dias só valem se a conexão sincronizou nas últimas 24h sem erro.
  const media7dPorConexao: Record<string, number> = {};
  for (const m of media7d as any[]) media7dPorConexao[m.conexaoId] = numero(m._sum?.spend) / 7;
  const depositos = await prisma.deposito.findMany({ where: { data: { gte: P.de, lte: P.ate } }, select: { contaId: true, valor: true } });
  const depPorConta: Record<string, number> = {};
  for (const d of depositos) depPorConta[d.contaId] = (depPorConta[d.contaId] || 0) + numero(d.valor);

  const contasOut = contas
    .filter((c) => {
      const cx = c.conexao_id ? conexaoPorId[c.conexao_id] : null;
      if (!lojaFiltro) return true;
      return !!cx && !!cx.store_id && lojaIds.includes(cx.store_id);
    })
    .map((c) => {
      const cx = c.conexao_id ? conexaoPorId[c.conexao_id] : null;
      const p = plat(c.plataforma);
      const saldo = numero(c.saldo);
      const mediaDia = cx && media7dPorConexao[cx.id] !== undefined ? media7dPorConexao[cx.id]! : numero(c.gastoDia);
      const atualizadoEm = cx?.ultimaSync ? new Date(cx.ultimaSync) : null;
      const fresco = !!atualizadoEm && agora - atualizadoEm.getTime() < UM_DIA && !cx?.ultimoErro;
      const diasRestantes = saldo > 0 && mediaDia > 0 ? Math.round((saldo / mediaDia) * 10) / 10 : null;
      let status: 'ok' | 'acabando' | 'zerado' | 'pos_paga' | 'desatualizado' | 'erro' | 'manual' | 'parada';
      if (!cx) status = 'manual';
      else if (cx.ultimoErro) status = 'erro';
      else if (!fresco) status = 'desatualizado';
      // Google sem orçamento de conta (pós-paga/cartão) volta saldo 0 exato. Saldo positivo mas < R$5 = o orçamento
      // da conta acabou (achado 28/10: GP Google R$0,13 e gasto ~0 desde 21/10; City R$0,48 com gasto 0 hoje).
      else if (saldo <= 0) status = p === 'google' ? 'pos_paga' : (mediaDia > 0 ? 'zerado' : 'parada');
      else if (saldo < SALDO_ZERADO) status = 'zerado';
      else if (mediaDia <= 0) status = 'parada';
      else if ((diasRestantes !== null && diasRestantes < 3) || (numero(c.limiteAlerta) > 0 && saldo <= numero(c.limiteAlerta))) status = 'acabando';
      else status = 'ok';
      return {
        id: c.id, nome: c.nome, plataforma: p, loja: cx?.store_id ? (nomeLoja[cx.store_id] || '') : '',
        saldo: r2(saldo), mediaDia: r2(mediaDia), gastoHoje: r2(numero(c.gastoDia)), diasRestantes, status,
        atualizadoEm: atualizadoEm ? atualizadoEm.toISOString() : null,
        erro: cx?.ultimoErro ? String(cx.ultimoErro).slice(0, 160) : null,
        depositado: r2(depPorConta[c.id] || 0),
      };
    });

  const conexoesComErro = conexoesDaLoja.filter((c) => c.ativo && c.ultimoErro).map((c) => ({
    nome: c.nome, plataforma: plat(c.plataforma), loja: nomeLoja[c.store_id || ''] || '', erro: String(c.ultimoErro).slice(0, 200),
    desde: c.ultimaSync ? new Date(c.ultimaSync).toISOString() : null,
  }));
  const conexoesParadas = conexoesDaLoja.filter((c) => c.ativo && !c.ultimoErro && (!c.ultimaSync || agora - new Date(c.ultimaSync).getTime() > UM_DIA))
    .map((c) => ({ nome: c.nome, plataforma: plat(c.plataforma), loja: nomeLoja[c.store_id || ''] || '', ultimaSync: c.ultimaSync ? new Date(c.ultimaSync).toISOString() : null }));

  const falhadosPorLoja: Record<string, number> = {};
  for (const f of falhados) {
    const lj = nomeLoja[lojaDoUsuarioId(f.criadoPorId) || ''] || '';
    falhadosPorLoja[lj] = (falhadosPorLoja[lj] || 0) + 1;
  }

  // ── Atendimento: robô x atendentes ──
  const roboChats = new Set<string>();
  const viaChats: Record<string, Set<string>> = { fluxo: new Set(), ia_livre: new Set(), cerebro: new Set() };
  const viaEventos: Record<string, number> = { fluxo: 0, ia_livre: 0, cerebro: 0 };
  for (const e of fluxo) {
    const k = `${e.usuarioId}|${e.chatJid}`;
    roboChats.add(k);
    const v = viaChats[e.via] ? e.via : 'ia_livre';
    viaChats[v]!.add(k);
    viaEventos[v] = (viaEventos[v] || 0) + 1;
  }
  const pausasPorMotivo: Record<string, number> = {};
  for (const p of pausas) { const m = String(p.motivoPausa || ''); if (m) pausasPorMotivo[m] = (pausasPorMotivo[m] || 0) + 1; }
  const agoraPorMotivo: Record<string, number> = {};
  for (const p of pausadasAgora) { const m = String(p.motivoPausa || 'sem_motivo'); agoraPorMotivo[m] = (agoraPorMotivo[m] || 0) + 1; }
  const fluxoDesde = fluxoMin._min.criadoEm ? new Date(fluxoMin._min.criadoEm) : null;

  // Atribuição das mensagens da equipe: 1º enviadoPorId (painel), 2º assinatura "*Nome:*" (extensão; nome completo
  // ou 1º nome único, sem acento — igual à Caixa de Entrada), 3º número não compartilhado → dono do número.
  const equipe = usuarios.filter((u) => !u.externo);
  const mapasNome = (lista: typeof equipe) => {
    const completo: Record<string, string> = {};
    const primeiro: Record<string, string | null> = {};
    for (const u of lista) {
      const n = normalizarNome(u.nome);
      if (!n) continue;
      completo[n] = u.id;
      const p1 = n.split(/\s+/)[0] || '';
      if (p1) primeiro[p1] = p1 in primeiro && primeiro[p1] !== u.id ? null : u.id;
    }
    return { completo, primeiro };
  };
  const mapaGeral = mapasNome(equipe.filter((u) => u.ativo));
  const mapaPorLoja: Record<string, ReturnType<typeof mapasNome>> = {};
  for (const l of lojas) mapaPorLoja[l.id] = mapasNome(equipe.filter((u) => u.lojaId === l.id));
  const acharPorAssinatura = (loja: string, ass: string): string | null => {
    const a = normalizarNome(ass);
    if (!a) return null;
    for (const mp of [mapaPorLoja[loja], mapaGeral]) {
      if (!mp) continue;
      const id = mp.completo[a] ?? mp.primeiro[a] ?? mp.primeiro[a.split(/\s+/)[0] || ''];
      if (id) return id;
    }
    return null;
  };
  const porAtendente: Record<string, { id: string; nome: string; loja: string; mensagens: number; chats: Set<string> }> = {};
  const semAtrib: Record<string, { mensagens: number; chats: Set<string> }> = {};
  for (const row of assinadasSql as any[]) {
    let quem: string | null = null;
    if (row.env && usuarioPorId[row.env]) quem = row.env;
    const ass = assinaturaValida(row.ass);
    if (!quem && ass) quem = acharPorAssinatura(row.loja, ass);
    // número dividido (2+ sessões na loja: Ana+Marina, Camila+Alan, Daniel+Diogo, José+Edna): sem assinatura
    // não dá pra saber quem foi → "sem atribuição" (não chuta o dono da sessão).
    if (!quem && row.sessao && (sessoesPorLoja[row.loja] || 0) <= 1) quem = row.sessao;
    const n = Number(row.n) || 0;
    if (quem) {
      const u = usuarioPorId[quem];
      const item = porAtendente[quem] || (porAtendente[quem] = { id: quem, nome: String(u?.nome || '').trim(), loja: nomeLoja[u?.lojaId || row.loja] || '', mensagens: 0, chats: new Set() });
      item.mensagens += n;
      item.chats.add(`${row.loja}|${row.chat}`);
    } else {
      const item = semAtrib[row.loja] || (semAtrib[row.loja] = { mensagens: 0, chats: new Set() });
      item.mensagens += n;
      item.chats.add(row.chat);
    }
  }
  const msgsRoboTotal = (msgsRobo as any[]).reduce((t, x) => t + numero(x._count?._all), 0);

  const faixa = (min: number) => (min < 60 ? 'ate1h' : min < 24 * 60 ? 'ate24h' : 'mais24h');
  const faixas = { ate1h: 0, ate24h: 0, mais24h: 0 };
  for (const e of esperando) faixas[faixa(e.minutos)]++;

  return {
    geradoEm: new Date(agora).toISOString(),
    periodo: { id: P.id, rotulo: P.rotulo, de: P.de, ate: P.ate },
    loja: lojaFiltro,
    podeTrocarLoja,
    lojasDisponiveis: (podeTrocarLoja ? lojasTodas : lojas).map((l) => ({ id: l.id, nome: l.store_name })),
    lojas: listaLojas,
    totais,
    alertas: {
      whatsapp: { comNumero: comNumero.length, conectados: comNumero.length - whatsappCaidos.length, caidos: whatsappCaidos },
      saldoAcabando: contasOut.filter((c) => c.status === 'acabando' || c.status === 'zerado'),
      contasDesatualizadas: contasOut.filter((c) => c.status === 'desatualizado'),
      conexoesComErro,
      conexoesParadas,
      agendamentosFalhados: {
        total: falhados.length,
        porLoja: falhadosPorLoja,
        itens: falhados.slice(0, 8).map((f) => ({
          cliente: f.cliente, atendente: String(usuarioPorId[f.criadoPorId]?.nome || '').trim(),
          loja: nomeLoja[lojaDoUsuarioId(f.criadoPorId) || ''] || '', quando: f.enviarEm.toISOString(),
          robo: String(f.observacoes || '').includes('robo-'),
        })),
      },
      revisoesAguardando,
      garantiasPendentes,
    },
    atendimento: {
      robo: {
        conversas: roboChats.size,
        porVia: { fluxo: viaChats.fluxo!.size, ia_livre: viaChats.ia_livre!.size, cerebro: viaChats.cerebro!.size },
        eventos: viaEventos,
        mensagens: msgsRoboTotal,
        // FluxoEvento guarda só 14 dias: período mais antigo que isso fica incompleto
        rastroDesde: fluxoDesde ? fluxoDesde.toISOString() : null,
        coberturaParcial: !fluxoDesde || fluxoDesde.getTime() > P.ini.getTime(),
        numerosComRobo: daLoja.filter((u) => u.ativo && u.botIaAtivo).map((u) => ({ nome: u.nome.trim(), loja: nomeLoja[u.lojaId || ''] || '' })),
      },
      pausas: {
        noPeriodo: Object.entries(pausasPorMotivo).sort((a, b) => b[1] - a[1]).map(([motivo, conversas]) => ({ motivo, rotulo: ROTULO_PAUSA[motivo] || motivo, conversas })),
        totalNoPeriodo: pausas.length,
        agora: Object.entries(agoraPorMotivo).sort((a, b) => b[1] - a[1]).map(([motivo, conversas]) => ({ motivo, rotulo: ROTULO_PAUSA[motivo] || motivo, conversas })),
        totalAgora: pausadasAgora.length,
      },
      atendentes: Object.values(porAtendente)
        .map((a) => ({ id: a.id, nome: a.nome, loja: a.loja, mensagens: a.mensagens, conversas: a.chats.size }))
        .sort((a, b) => b.mensagens - a.mensagens),
      semAtribuicao: Object.entries(semAtrib).map(([loja, v]) => ({ loja: nomeLoja[loja] || '', mensagens: v.mensagens, conversas: v.chats.size }))
        .sort((a, b) => b.mensagens - a.mensagens),
      semResposta: {
        total: esperando.length,
        robo: esperando.filter((e) => e.tipo === 'robo').length,
        atendente: esperando.filter((e) => e.tipo === 'atendente').length,
        robo24h: esperando.filter((e) => e.tipo === 'robo' && e.minutos < 24 * 60).length,
        atendente24h: esperando.filter((e) => e.tipo === 'atendente' && e.minutos < 24 * 60).length,
        faixas,
        recentes: esperando.slice(0, 8),
      },
    },
    anuncios: {
      porPlataforma,
      total: { gasto: totais.gasto, conversoes: totais.conversoes, custoPorConversao: totais.custoPorConversao },
      contas: contasOut,
      depositado: r2(contasOut.reduce((t, c) => t + c.depositado, 0)), // registros da tela Saldos (Deposito) no período
    },
    garantia: { ativas: garantiasAtivas, novasNoPeriodo: garantiasNovas, aguardandoAprovacao: garantiasPendentes, revisoesAguardando, avisosDevidos },
    pontos,
  };
}

router.get('/painel', async (req, res) => {
  try {
    const q = String(req.query.periodo || 'mes');
    const periodo: PeriodoId = (Object.keys(PERIODOS) as PeriodoId[]).includes(q as PeriodoId) ? (q as PeriodoId) : 'mes';
    // Gerente: sempre a própria loja (o parâmetro é ignorado). Master/operador escolhem.
    const escopo = await lojaDoUsuario(req);
    const pedida = String(req.query.loja || '');
    const lojaFiltro = escopo || (pedida && pedida !== 'todas' ? pedida : null);
    const chave = `${periodo}|${lojaFiltro || 'todas'}|${escopo ? 'g' : 'm'}`;
    const c = cachePainel.get(chave);
    if (c && Date.now() - c.t < CACHE_MS && req.query.atualizar === undefined) return res.json(c.dados);
    const dados = await montarPainel(periodo, lojaFiltro, !escopo);
    cachePainel.set(chave, { t: Date.now(), dados });
    if (cachePainel.size > 50) cachePainel.clear();
    res.json(dados);
  } catch (error: any) {
    console.error('Erro ao montar o painel:', error);
    res.status(500).json({ error: error?.message || 'Erro ao montar o painel.' });
  }
});

export default router;
