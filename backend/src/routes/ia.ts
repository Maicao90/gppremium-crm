// ============================================================================
// ROTA /api/ia — cérebro REAL do Assistente IA (API da Anthropic / Claude)
//
// POST /api/ia  body: { pergunta: string, historico?: [{papel:'usuario'|'ia', texto:string}] }
//   → { resposta: string }
//
// - Lê ANTHROPIC_API_KEY do .env (dotenv já é carregado no server.ts).
//   Sem chave → HTTP 503 { error: 'ia_nao_configurada' } (o front cai no motor local).
// - Monta um CONTEXTO compacto com dados reais do banco (campanhas, lojas,
//   contas, agendamentos, atendentes, mensagens e métricas diárias) e injeta
//   no system prompt junto com a persona.
// - IMPORTANTE: a chave NUNCA é logada nem devolvida em nenhuma resposta.
// ============================================================================
import { Router } from 'express';
import { prisma } from '../server';

const router = Router();

// Modelo padrão (pode ser trocado via ANTHROPIC_MODEL no .env)
const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

// Limite de tamanho do contexto injetado no system prompt (~4000 caracteres)
const LIMITE_CONTEXTO = 4000;

// Persona do assistente (system prompt). O contexto com os dados é anexado depois.
const PERSONA = `Você é o assistente de gestão da GP Premium, um grupo de lojas de pneus em Goiás e no Distrito Federal.

Regras:
- Responda SEMPRE em português do Brasil, de forma direta, prática e sem enrolação.
- Formate valores monetários em reais no padrão brasileiro (ex.: R$ 1.234,56).
- Use SOMENTE os dados do contexto fornecido abaixo. NUNCA invente números, campanhas, lojas ou métricas.
- Se o dado pedido não estiver no contexto, diga claramente que não tem essa informação e sugira onde ver no painel (Dashboard, Campanhas, Saldos, Agendamentos ou Atendimento/Caixa de Entrada).
- Pode analisar e recomendar ações (ex.: CPL alto, saldo acabando, campanha sem lead), sempre com base nos números do contexto.`;

// ── Helpers de formatação (pt-BR) ───────────────────────────────────────────
const real = (n: number) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBR = (d: Date) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const diaBR = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

// ── Montagem do CONTEXTO do CRM ─────────────────────────────────────────────
// Cada bloco é consultado num try/catch próprio: se uma tabela falhar/não existir,
// o restante do contexto continua sendo montado normalmente.
async function montarContexto(): Promise<string> {
  const partes: string[] = [];
  const agora = new Date();

  // 1) Campanhas — contagem e resumo (nome, plataforma, status, gasto, leads)
  try {
    const [total, campanhas] = await Promise.all([
      prisma.campanha.count(),
      prisma.campanha.findMany({
        orderBy: { spend: 'desc' },
        take: 25,
        select: { name: true, platform: true, status: true, spend: true, leads: true },
      }),
    ]);
    if (total > 0) {
      const gastoTotal = campanhas.reduce((a, c) => a + (c.spend || 0), 0);
      const leadsTotal = campanhas.reduce((a, c) => a + (c.leads || 0), 0);
      const linhas = campanhas.map((c) =>
        `- ${c.name || '(sem nome)'} [${c.platform}/${c.status}] gasto ${real(c.spend)} · ${c.leads} leads`
      );
      partes.push(
        `CAMPANHAS (${total} no total; top ${campanhas.length} por gasto; soma listada: ${real(gastoTotal)} e ${leadsTotal} leads):\n${linhas.join('\n')}`
      );
    } else {
      partes.push('CAMPANHAS: nenhuma cadastrada.');
    }
  } catch { /* segue sem campanhas */ }

  // 2) Lojas (nome, cidade)
  try {
    const lojas = await prisma.loja.findMany({
      take: 30,
      select: { store_name: true, city: true, state: true },
      orderBy: { store_name: 'asc' },
    });
    if (lojas.length) {
      partes.push(`LOJAS (${lojas.length}): ${lojas.map((l) => `${l.store_name}${l.city ? ` (${l.city}${l.state ? `/${l.state}` : ''})` : ''}`).join('; ')}`);
    }
  } catch { /* segue sem lojas */ }

  // 3) Contas de anúncio / saldos (nome, saldo, gasto diário)
  try {
    const contas = await prisma.contaAnuncio.findMany({
      select: { nome: true, plataforma: true, saldo: true, gastoDia: true, ultimoDepValor: true, ultimoDepData: true },
    });
    if (contas.length) {
      const linhas = contas.map((c) =>
        `- ${c.nome} [${c.plataforma}] saldo ${real(c.saldo)} · gasto/dia ${real(c.gastoDia)}${c.ultimoDepValor ? ` · últ. depósito ${real(c.ultimoDepValor)}${c.ultimoDepData ? ` em ${c.ultimoDepData}` : ''}` : ''}`
      );
      partes.push(`CONTAS DE ANÚNCIO (${contas.length}):\n${linhas.join('\n')}`);
    }
  } catch { /* segue sem contas */ }

  // 4) Agendamentos — por status (últimos 30 dias) + próximos 5 pendentes
  try {
    const inicio30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const porStatus = await prisma.agendamento.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { criadoEm: { gte: inicio30d } },
    });
    const resumo = porStatus.map((s) => `${s.status}: ${s._count._all}`).join(' · ') || 'nenhum nos últimos 30 dias';
    const proximos = await prisma.agendamento.findMany({
      where: { status: 'pendente' },
      orderBy: { enviarEm: 'asc' },
      take: 5,
      select: { cliente: true, enviarEm: true },
    });
    let bloco = `AGENDAMENTOS (últimos 30 dias, por status): ${resumo}`;
    if (proximos.length) {
      bloco += `\nPróximos pendentes: ${proximos.map((a) => `${a.cliente || 'contato'} em ${dataBR(a.enviarEm)}`).join('; ')}`;
    }
    partes.push(bloco);
  } catch { /* segue sem agendamentos */ }

  // 5) Atendentes (nome, WhatsApp conectado)
  try {
    const atendentes = await prisma.usuario.findMany({
      where: { ativo: true, externo: false },
      select: { nome: true, whatsappConectado: true },
      take: 20,
    });
    if (atendentes.length) {
      partes.push(`ATENDENTES ATIVOS (${atendentes.length}): ${atendentes.map((u) => `${u.nome} (WhatsApp ${u.whatsappConectado ? 'conectado' : 'desconectado'})`).join('; ')}`);
    }
  } catch { /* segue sem atendentes */ }

  // 6) Mensagens de hoje (Caixa de Entrada do WhatsApp)
  try {
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const msgsHoje = await prisma.mensagem.count({ where: { timestamp: { gte: inicioHoje } } });
    partes.push(`MENSAGENS DE WHATSAPP HOJE: ${msgsHoje}`);
  } catch { /* segue sem mensagens */ }

  // 7) Métricas diárias agregadas dos últimos 7 dias (se a integração de Ads já populou)
  try {
    const inicio7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const metricas = await prisma.metricaDiaria.groupBy({
      by: ['data'],
      _sum: { spend: true, leads: true, cliques: true, impressoes: true },
      where: { data: { gte: inicio7d } },
      orderBy: { data: 'asc' },
    });
    if (metricas.length) {
      const linhas = metricas.map((m) =>
        `- ${diaBR(m.data)}: gasto ${real(m._sum.spend || 0)} · ${m._sum.leads || 0} leads · ${m._sum.cliques || 0} cliques · ${m._sum.impressoes || 0} impressões`
      );
      partes.push(`MÉTRICAS DIÁRIAS DAS PLATAFORMAS (últimos 7 dias, agregado):\n${linhas.join('\n')}`);
    }
  } catch { /* segue sem métricas */ }

  partes.push(`Data/hora atual do servidor: ${dataBR(agora)}.`);

  // Mantém o contexto compacto (~4000 caracteres)
  let contexto = partes.join('\n\n');
  if (contexto.length > LIMITE_CONTEXTO) {
    contexto = contexto.slice(0, LIMITE_CONTEXTO) + '\n[contexto truncado por tamanho]';
  }
  return contexto;
}

// ── Rota principal ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { pergunta, historico } = req.body || {};

    if (!pergunta || typeof pergunta !== 'string' || !pergunta.trim()) {
      return res.status(400).json({ error: 'pergunta_obrigatoria', detalhe: 'Envie { pergunta: string } no corpo da requisição.' });
    }

    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) {
      // IA real não ativada: o front mostra aviso amigável e usa o motor local.
      return res.status(503).json({ error: 'ia_nao_configurada', detalhe: 'Defina ANTHROPIC_API_KEY no arquivo .env do servidor.' });
    }

    // Contexto com dados reais do CRM (cada bloco tem fallback próprio)
    const contexto = await montarContexto();
    const systemPrompt = `${PERSONA}\n\n=== DADOS ATUAIS DO CRM (use somente isto como fonte de números) ===\n${contexto}`;

    // Converte o histórico do front ({papel:'usuario'|'ia'}) para o formato da API.
    // Mantém só as últimas ~12 mensagens (~6 trocas) e limita o tamanho de cada uma.
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(historico)) {
      for (const h of historico.slice(-12)) {
        if (h && typeof h.texto === 'string' && h.texto.trim()) {
          messages.push({
            role: h.papel === 'ia' ? 'assistant' : 'user',
            content: h.texto.slice(0, 2000),
          });
        }
      }
    }
    // A primeira mensagem enviada à API precisa ser do usuário
    while (messages.length && messages[0]?.role === 'assistant') messages.shift();
    messages.push({ role: 'user', content: pergunta.slice(0, 4000) });

    // Chamada à API da Anthropic (fetch nativo do Node 20; sem dependências novas)
    let resposta: Response;
    try {
      resposta = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
          max_tokens: 1000,
          system: systemPrompt,
          messages,
        }),
        signal: AbortSignal.timeout(60_000), // evita requisição pendurada
      });
    } catch {
      // Erro de rede/timeout antes de obter resposta (nunca logamos a chave)
      console.error('[IA] Falha de rede ao chamar a API da Anthropic.');
      return res.status(502).json({ error: 'ia_erro', detalhe: 'Não consegui conectar ao serviço de IA. Verifique a internet do servidor e tente de novo.' });
    }

    if (!resposta.ok) {
      // Extrai a mensagem de erro da API para mapear um aviso amigável
      let msgApi = '';
      try {
        const corpoErro: any = await resposta.json();
        msgApi = String(corpoErro?.error?.message || '');
      } catch { /* corpo não-JSON */ }

      // Log de diagnóstico: só status + mensagem da API (NUNCA a chave)
      console.error(`[IA] Erro da API Anthropic (HTTP ${resposta.status}): ${msgApi}`);

      let amigavel = 'A IA não conseguiu responder agora. Tente novamente em instantes.';
      if (resposta.status === 401) {
        amigavel = 'Chave da IA inválida. Confira a ANTHROPIC_API_KEY no .env do servidor.';
      } else if (resposta.status === 400 && /credit/i.test(msgApi)) {
        amigavel = 'Sem créditos na conta Anthropic. Adicione créditos em console.anthropic.com e tente de novo.';
      } else if (resposta.status === 429) {
        amigavel = 'Muitas perguntas em sequência. Aguarde alguns segundos e tente novamente.';
      } else if (resposta.status === 529 || resposta.status >= 500) {
        amigavel = 'O serviço de IA está sobrecarregado no momento. Tente novamente em instantes.';
      } else if (resposta.status === 400) {
        amigavel = 'A pergunta não pôde ser processada pela IA. Tente reformular.';
      }
      return res.status(502).json({ error: 'ia_erro', detalhe: amigavel });
    }

    const dados: any = await resposta.json();
    // A resposta vem como lista de blocos; concatenamos os blocos de texto
    const texto = Array.isArray(dados?.content)
      ? dados.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('\n').trim()
      : '';

    if (!texto) {
      return res.status(502).json({ error: 'ia_erro', detalhe: 'A IA retornou uma resposta vazia. Tente novamente.' });
    }

    return res.json({ resposta: texto });
  } catch (e) {
    console.error('[IA] Erro inesperado na rota /api/ia:', e);
    return res.status(500).json({ error: 'ia_erro', detalhe: 'Erro interno ao processar a pergunta.' });
  }
});

export default router;
