import { Router } from 'express';
import { prisma } from '../server';
import { ehMaster } from '../auth/modulos';
import { CATALOGO_FLUXO, GRUPOS_FLUXO, categoriaPorChave, validarTextoFluxo } from '../data/fluxoCatalogo';
import { TABELA_PRECOS_GP } from '../data/tabelaPrecos';
import { VALOR_BALANCEAMENTO_POR_RODA, PARCELAS_MAXIMAS } from '../data/fluxoPreco';
import { lerConfigLojasBot, salvarConfigLojaBot, CAMPOS_CONFIG_LOJA } from '../services/botLojas';

// Edicao de UMA loja: chave "loja:<lojaId>:<chave>" na mesma tabela (o padrao geral continua sem prefixo).
const chaveDaLoja = (lojaId: string, chave: string) => `loja:${lojaId}:${chave}`;
const lojaDaReq = (req: any): string => String(req.query?.lojaId || req.body?.lojaId || '').trim().replace(/[^a-zA-Z0-9-]/g, '');

// O mesmo 5% de montarPartesDescontoAVista (tabelaPrecos.ts): desconto so a vista EM DINHEIRO (PIX nao tem).
const DESCONTO_DINHEIRO_PCT = 5;

// Tela "Fluxo" do painel: mostra o mapa do atendimento do robo (catalogo em
// data/fluxoCatalogo.ts) e deixa o dono editar o TEXTO de cada resposta fixa.
// So o texto e editavel — numero (preco, parcela, desconto) sai sempre da tabela de precos.
// Guardamos so a DIFERENCA do padrao (tabela FluxoResposta); apagar volta pro padrao.
// Ver a tela exige o modulo 'at-fluxo'; editar/restaurar exige master/admin.

const router = Router();

function lerPartes(json: string): string[] | null {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) && p.length > 0 ? p.map(String) : null;
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const lojaId = lojaDaReq(req);
    const linhas = await prisma.fluxoResposta.findMany();
    const porChave = new Map(linhas.map((l) => [l.chave, l]));
    const categorias = CATALOGO_FLUXO.map((c) => {
      const edicaoGeral = c.partes ? porChave.get(c.chave) : undefined;
      const geral = edicaoGeral ? lerPartes(edicaoGeral.partes) : null;
      const edicaoLoja = c.partes && lojaId ? porChave.get(chaveDaLoja(lojaId, c.chave)) : undefined;
      const daLoja = edicaoLoja ? lerPartes(edicaoLoja.partes) : null;
      const editadas = daLoja ?? geral;
      const edicao = daLoja ? edicaoLoja : edicaoGeral;
      return {
        ...c,
        atual: c.partes ? (editadas ?? c.partes) : null,
        // Na tela de uma loja, "personalizado" = esta loja tem texto proprio; o texto geral aparece como base.
        personalizado: lojaId ? !!daLoja : !!geral,
        personalizadoGeral: !!geral,
        atualizadoEm: editadas && edicao ? edicao.atualizadoEm : null,
      };
    });
    const lojas = await prisma.loja.findMany({ select: { id: true, store_name: true }, orderBy: { store_name: 'asc' } });
    const cfgLojas = lerConfigLojasBot();
    res.json({
      grupos: GRUPOS_FLUXO,
      categorias,
      podeEditar: ehMaster(String(req.user?.role || '')),
      lojaId: lojaId || null,
      lojas: lojas.map((l) => ({ id: l.id, nome: l.store_name, temConfig: !!cfgLojas[l.id] })),
      configLoja: lojaId ? (cfgLojas[lojaId] || {}) : null,
      camposConfigLoja: CAMPOS_CONFIG_LOJA,
    });
  } catch (e: any) {
    console.error('[Fluxo] GET:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível carregar o fluxo.' });
  }
});

// ---------- Fluxograma AO VIVO ----------
// Por onde as mensagens dos clientes estao passando no fluxo (rastro gravado pelo botAtendimentoService
// a cada resposta). Master ve todas as contas com robo; os demais so a propria.
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://127.0.0.1:3010';

function escopoUsuarios(req: any): { usuarioId?: string } {
  return ehMaster(String(req.user?.role || '')) ? {} : { usuarioId: String(req.user?.sub || '') };
}

function jsonArray(s: string | null | undefined): string[] {
  try {
    const a = JSON.parse(s || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

function nomeOuNumero(nome: string | null | undefined, chatJid: string): string {
  if (nome && nome.trim()) return nome.trim();
  const dig = String(chatJid || '').split('@')[0] || '';
  return dig.length > 6 ? `…${dig.slice(-6)}` : dig || 'Cliente';
}

router.get('/ao-vivo', async (req, res) => {
  try {
    const escopo = escopoUsuarios(req);
    const desdeParam = Number(req.query.desde);
    const desde = Number.isFinite(desdeParam) && desdeParam > 0 ? new Date(desdeParam) : new Date(Date.now() - 60 * 60 * 1000);

    const eventos = await prisma.fluxoEvento.findMany({
      where: { ...escopo, criadoEm: { gt: desde } },
      orderBy: { criadoEm: 'desc' },
      take: 60,
    });

    // Onde cada conversa esta AGORA (estado do fluxo de preco), das ultimas 24h.
    const conversas = await prisma.botConversa.findMany({
      where: { ...escopo, atualizadoEm: { gte: new Date(Date.now() - 24 * 3600 * 1000) }, estadoPreco: { not: 'sem_estado' } },
      orderBy: { atualizadoEm: 'desc' },
      take: 200,
      select: { chatJid: true, estadoPreco: true, dadosPreco: true, atualizadoEm: true },
    });
    const nomes = new Map<string, string>();
    const recentes = await prisma.fluxoEvento.findMany({ where: { ...escopo, criadoEm: { gte: new Date(Date.now() - 24 * 3600 * 1000) }, chatNome: { not: null } }, orderBy: { criadoEm: 'desc' }, take: 400, select: { chatJid: true, chatNome: true } });
    for (const r of recentes) if (r.chatNome && !nomes.has(r.chatJid)) nomes.set(r.chatJid, r.chatNome);

    const estados: Record<string, Array<{ nome: string; minutos: number; medida?: string }>> = {};
    for (const c of conversas) {
      let medida: string | undefined;
      try { medida = JSON.parse(c.dadosPreco || '{}').medida; } catch { /* ignora */ }
      (estados[c.estadoPreco || 'sem_estado'] ||= []).push({ nome: nomeOuNumero(nomes.get(c.chatJid), c.chatJid), minutos: Math.round((Date.now() - c.atualizadoEm.getTime()) / 60000), ...(medida ? { medida } : {}) });
    }

    res.json({
      agora: Date.now(),
      eventos: eventos.map((e) => ({
        id: e.id,
        quando: e.criadoEm.getTime(),
        chat: nomeOuNumero(e.chatNome, e.chatJid),
        cliente: e.cliente,
        assuntos: jsonArray(e.assuntos),
        chaves: jsonArray(e.chaves),
        via: e.via,
        motivoLivre: e.motivoLivre,
        estadoAntes: e.estadoAntes,
        estadoDepois: e.estadoDepois,
        partes: jsonArray(e.partes),
      })),
      estados,
    });
  } catch (e: any) {
    console.error('[Fluxo] GET /ao-vivo:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível carregar o fluxo ao vivo.' });
  }
});

// ---------- Tabela de precos que o robo usa (so leitura) ----------
// A MESMA tabela do codigo (tabelaPrecos.ts, gerada da planilha do dono). Preco nao se edita pela tela:
// muda a planilha e gera de novo. Aqui so mostra, com os valores ja calculados do jeito que o robo fala.
const centavos = (v: number) => Math.round(v * 100) / 100;
router.get('/precos', (_req, res) => {
  const itens = TABELA_PRECOS_GP.map((i) => ({
    medida: i.medida,
    modelo: i.modelo,
    categoria: i.categoria,
    promocao: !!i.promocao,
    compre3Leve4: !!i.compre3Leve4,
    aVista: i.aVista,
    dinheiro: centavos(i.aVista * (1 - DESCONTO_DINHEIRO_PCT / 100)),
    parcelas: Object.entries(i.parcelado)
      .map(([k, total]) => ({ n: Number(k.replace('x', '')), total: Number(total), parcela: centavos(Number(total) / Number(k.replace('x', ''))) }))
      .sort((a, b) => a.n - b.n),
  }));
  res.json({
    itens,
    regras: { balanceamentoPorRoda: VALOR_BALANCEAMENTO_POR_RODA, descontoDinheiroPct: DESCONTO_DINHEIRO_PCT, parcelasMaximas: PARCELAS_MAXIMAS },
    origem: 'Planilha do dono de 02/09/2026 (Tabela_de_Precos_Pneus_Organizada.xlsx)',
  });
});

// ---------- O que a IA ainda decidiu sozinha ----------
// Toda resposta que NAO saiu do fluxo (via 'ia_livre'), com o motivo: mostra o que ainda falta fechar em codigo.
router.get('/ia-livre', async (req, res) => {
  try {
    const escopo = escopoUsuarios(req);
    // O rastro (FluxoEvento) so guarda 14 dias (limpeza no botAtendimentoService).
    const dias = Math.max(1, Math.min(14, Number(req.query.dias) || 7));
    const desde = new Date(Date.now() - dias * 24 * 3600 * 1000);
    const onde = { ...escopo, criadoEm: { gte: desde } };
    const [porVia, motivos, livres] = await Promise.all([
      prisma.fluxoEvento.groupBy({ by: ['via'], where: onde, _count: { _all: true } }),
      prisma.fluxoEvento.groupBy({ by: ['motivoLivre'], where: { ...onde, via: 'ia_livre' }, _count: { _all: true } }),
      prisma.fluxoEvento.findMany({ where: { ...onde, via: 'ia_livre' }, orderBy: { criadoEm: 'desc' }, take: 150 }),
    ]);
    const contagem: Record<string, number> = {};
    for (const v of porVia) contagem[v.via] = v._count._all;
    // Contagem por motivo de TODOS os eventos do periodo (a lista abaixo mostra so os 150 mais recentes).
    const porMotivo: Record<string, number> = {};
    for (const m of motivos) porMotivo[m.motivoLivre || 'outro'] = (porMotivo[m.motivoLivre || 'outro'] || 0) + m._count._all;
    res.json({
      dias,
      porVia: contagem,
      porMotivo,
      totalLivres: contagem['ia_livre'] || 0,
      eventos: livres.map((e) => ({
        id: e.id,
        quando: e.criadoEm.getTime(),
        chat: nomeOuNumero(e.chatNome, e.chatJid),
        cliente: e.cliente,
        assuntos: jsonArray(e.assuntos),
        motivoLivre: e.motivoLivre,
        estadoAntes: e.estadoAntes,
        partes: jsonArray(e.partes),
      })),
    });
  } catch (e: any) {
    console.error('[Fluxo] GET /ia-livre:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível carregar as decisões da IA.' });
  }
});

// "Testar uma mensagem": roda o MESMO fluxo (leitura por IA + motor) sem enviar nada e sem chamar a IA livre.
router.post('/simular', async (req, res) => {
  try {
    const mensagens: string[] = (Array.isArray(req.body?.mensagens) ? req.body.mensagens : [req.body?.mensagem])
      .map((m: unknown) => String(m ?? '').trim())
      .filter(Boolean)
      .slice(0, 6);
    if (!mensagens.length) return res.status(400).json({ error: 'Escreva pelo menos uma mensagem do cliente.' });
    const historico = Array.isArray(req.body?.historico)
      ? req.body.historico.slice(-10).map((h: any) => ({ role: h?.role === 'assistant' ? 'assistant' : 'user', content: String(h?.content ?? '').slice(0, 600) }))
      : [];
    const estado = ['sem_estado', 'aguardando_medida', 'medida_sem_match', 'preco_confirmado'].includes(req.body?.estado) ? req.body.estado : 'sem_estado';
    const dados = req.body?.dados && typeof req.body.dados === 'object' ? req.body.dados : {};

    const lojaId = lojaDaReq(req);
    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const textosFluxo: Record<string, string[]> = {};
    for (const l of linhas) { if (l.chave.startsWith('loja:')) continue; const p = jsonArray(l.partes); if (p.length) textosFluxo[l.chave] = p; }
    if (lojaId) {
      for (const l of linhas) {
        const pref = `loja:${lojaId}:`;
        if (!l.chave.startsWith(pref)) continue;
        const p = jsonArray(l.partes); if (p.length) textosFluxo[l.chave.slice(pref.length)] = p;
      }
    }
    const cfgLoja = lojaId ? lerConfigLojasBot()[lojaId] : null;
    const lojaBot = cfgLoja && cfgLoja.NOME_LOJA
      ? { nome: String(cfgLoja.NOME_LOJA), telefone: String(cfgLoja.TELEFONE || ''), horario: String(cfgLoja.HORARIO || ''), localizacao: String(cfgLoja.LOCALIZACAO || ''), localizacaoTexto: String(cfgLoja.LOCALIZACAO_TEXTO || '') }
      : undefined;

    const messages = [...historico, ...mensagens.map((content) => ({ role: 'user', content }))];
    const r = await fetch(`${BOT_SERVICE_URL}/gerar-resposta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, lojas: [], ultimosTextosCliente: mensagens.join('\n'), estadoPreco: estado, dadosPreco: JSON.stringify(dados), textosFluxo, lojaBot, simular: true }),
      signal: AbortSignal.timeout(30_000),
    });
    const corpo: any = await r.json().catch(() => null);
    if (!r.ok || !corpo) return res.status(502).json({ error: 'O robô não respondeu à simulação.' });
    res.json(corpo);
  } catch (e: any) {
    console.error('[Fluxo] POST /simular:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível simular.' });
  }
});

// Dados do robo de UMA loja (data/bot-lojas.json). Ler: quem ve o Fluxo. Salvar: so o administrador.
router.get('/loja-config/:lojaId', (req, res) => {
  const lojaId = String(req.params.lojaId || '').replace(/[^a-zA-Z0-9-]/g, '');
  res.json({ lojaId, config: lerConfigLojasBot()[lojaId] || {}, campos: CAMPOS_CONFIG_LOJA });
});
router.put('/loja-config/:lojaId', async (req, res) => {
  try {
    if (!ehMaster(String(req.user?.role || ''))) return res.status(403).json({ error: 'Apenas o administrador pode editar os dados da loja.' });
    const lojaId = String(req.params.lojaId || '').replace(/[^a-zA-Z0-9-]/g, '');
    const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { id: true } });
    if (!loja) return res.status(404).json({ error: 'Loja não encontrada.' });
    const r = salvarConfigLojaBot(lojaId, req.body?.config || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json({ ok: true, config: r.config });
  } catch (e: any) {
    console.error('[Fluxo] PUT loja-config:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível salvar os dados da loja.' });
  }
});

router.put('/:chave', async (req, res) => {
  try {
    if (!ehMaster(String(req.user?.role || ''))) return res.status(403).json({ error: 'Apenas o administrador pode editar as respostas.' });
    const chave = String(req.params.chave || '');
    const cat = categoriaPorChave(chave);
    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });

    const partes = Array.isArray(req.body?.partes) ? req.body.partes.map((p: unknown) => String(p ?? '').trim()) : req.body?.partes;
    const problemas = validarTextoFluxo(chave, partes);
    if (problemas.length) return res.status(400).json({ error: problemas.join(' '), problemas });

    const lojaId = lojaDaReq(req);
    if (lojaId) {
      // Texto proprio desta loja. Igual ao que ela herdaria (geral editado ou padrao) = apaga o proprio.
      const geral = await prisma.fluxoResposta.findUnique({ where: { chave } });
      const herdado = (geral && lerPartes(geral.partes)) || cat.partes;
      const k = chaveDaLoja(lojaId, chave);
      if (JSON.stringify(partes) === JSON.stringify(herdado)) {
        await prisma.fluxoResposta.deleteMany({ where: { chave: k } });
        return res.json({ ok: true, personalizado: false, atual: herdado });
      }
      const linhaLoja = await prisma.fluxoResposta.upsert({
        where: { chave: k },
        create: { chave: k, partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
        update: { partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
      });
      return res.json({ ok: true, personalizado: true, atual: partes, atualizadoEm: linhaLoja.atualizadoEm });
    }

    // Igual ao padrao = sem edicao (nao deixa linha "personalizada" sem diferenca nenhuma).
    if (JSON.stringify(partes) === JSON.stringify(cat.partes)) {
      await prisma.fluxoResposta.deleteMany({ where: { chave } });
      return res.json({ ok: true, personalizado: false, atual: cat.partes });
    }
    const linha = await prisma.fluxoResposta.upsert({
      where: { chave },
      create: { chave, partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
      update: { partes: JSON.stringify(partes), atualizadoPor: req.user?.sub ?? null },
    });
    res.json({ ok: true, personalizado: true, atual: partes, atualizadoEm: linha.atualizadoEm });
  } catch (e: any) {
    console.error('[Fluxo] PUT:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível salvar a resposta.' });
  }
});

router.delete('/:chave', async (req, res) => {
  try {
    if (!ehMaster(String(req.user?.role || ''))) return res.status(403).json({ error: 'Apenas o administrador pode restaurar as respostas.' });
    const chave = String(req.params.chave || '');
    const cat = categoriaPorChave(chave);
    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });
    const lojaId = lojaDaReq(req);
    if (lojaId) {
      await prisma.fluxoResposta.deleteMany({ where: { chave: chaveDaLoja(lojaId, chave) } });
      const geral = await prisma.fluxoResposta.findUnique({ where: { chave } });
      return res.json({ ok: true, personalizado: false, atual: (geral && lerPartes(geral.partes)) || cat.partes });
    }
    await prisma.fluxoResposta.deleteMany({ where: { chave } });
    res.json({ ok: true, personalizado: false, atual: cat.partes });
  } catch (e: any) {
    console.error('[Fluxo] DELETE:', e?.message || e);
    res.status(500).json({ error: 'Não foi possível restaurar a resposta.' });
  }
});

export default router;
