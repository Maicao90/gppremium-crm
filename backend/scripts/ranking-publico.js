// Ranking publico da campanha (21/10): gera public/ranking/dados.json com a MESMA regra do painel
// (Metricas > Pontuacao). Roda 1x por dia pelo cron; stories/Google vem do public/anuncios/dados/pontuacao.json.
// So le o banco (Prisma, sem WhatsApp) — seguro rodar a qualquer hora.
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const PUBLIC = path.join(__dirname, '../public');
const ARQ_CAMPANHA = path.join(PUBLIC, 'anuncios/dados/pontuacao.json');
const SAIDA = path.join(PUBLIC, 'ranking/dados.json');
const diaBR = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

(async () => {
  const prisma = new PrismaClient();
  try {
    const c = JSON.parse(fs.readFileSync(ARQ_CAMPANHA, 'utf8'));
    // 23/10 (dono: "agendamentos tem que atualizar automatico"): com ateAutomatico, o fim do periodo e sempre HOJE
    // (Brasilia) — os agendamentos programados ate agora entram sozinhos. Grava de volta pro painel ler o mesmo periodo.
    if (c.ateAutomatico) {
      const hoje = diaBR(Date.now());
      if (c.ate !== hoje) { c.ate = hoje; fs.writeFileSync(ARQ_CAMPANHA, JSON.stringify(c, null, 1)); }
    }
    const pesos = { story: 1, google: 3, agendamento: 1, ...(c.pontos || {}) };
    const juntar = c.juntar || {};
    const ocultar = new Set([...(c.ocultar || []), ...Object.keys(juntar)]);
    const lanc = c.lancamentos || {};
    const ids = Object.keys(lanc).filter((id) => !ocultar.has(id));
    const contasDe = (id) => [id, ...Object.keys(juntar).filter((k) => juntar[k] === id)];
    const todas = [...new Set(ids.flatMap(contasDe))];

    // janela larga em UTC; o corte exato e pelo dia em Brasilia (diaBR), igual ao painel
    const ini = new Date(`${c.de}T00:00:00-03:00`);
    const fim = new Date(new Date(`${c.ate}T00:00:00-03:00`).getTime() + 86400000);
    // Decisao do dono (21/10): todo agendamento PROGRAMADO (criado) no periodo, ja tenha saido ou nao; um por um.
    const ags = await prisma.agendamento.findMany({
      // criados no periodo (atendente) OU do robo com envio no mes da campanha (23/10) — o corte fino e logo abaixo
      where: { criadoPorId: { in: todas }, status: { not: 'cancelado' }, OR: [{ criadoEm: { gte: ini, lt: fim } }, { observacoes: { contains: 'robo-' } }] },
      select: { criadoPorId: true, status: true, criadoEm: true, enviarEm: true, atualizadoEm: true, observacoes: true },
    });
    const usuarios = await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, lojaId: true } });
    const lojas = await prisma.loja.findMany({ where: { id: { in: usuarios.map((u) => u.lojaId).filter(Boolean) } }, select: { id: true, store_name: true } });
    const nomeLoja = Object.fromEntries(lojas.map((l) => [l.id, l.store_name]));

    const linhas = ids.map((id) => {
      const contas = contasDe(id);
      // 23/10 (dono): do ROBO conta igual a tabela do mes (dia de envio dentro do mes da campanha); da atendente, dia criado.
      const [ay, am] = c.ate.split('-').map(Number);
      const fimDoMes = new Date(Date.UTC(ay, am, 0)).toISOString().slice(0, 10);
      const diaEfetivo = (a) => diaBR(a.status === 'enviado' ? a.atualizadoEm : a.enviarEm);
      const contados = ags.filter((a) => contas.includes(a.criadoPorId) && (String(a.observacoes || '').includes('robo-')
        ? diaEfetivo(a) >= c.de && diaEfetivo(a) <= fimDoMes
        : diaBR(a.criadoEm) >= c.de && diaBR(a.criadoEm) <= c.ate));
      const enviados = contados.filter((a) => a.status === 'enviado').length;
      const u = usuarios.find((x) => x.id === id);
      const stories = contas.reduce((t, k) => t + (Number(lanc[k]?.stories) || 0), 0);
      const google = contas.reduce((t, k) => t + (Number(lanc[k]?.google) || 0), 0);
      const ag = contados.length;
      return {
        nome: (c.nomes || {})[id] || String(u?.nome || lanc[id]?.nome || '').trim(),
        loja: nomeLoja[u?.lojaId] || '',
        agendamentos: ag, enviados, programados: ag - enviados, stories, google,
        pontos: { agendamentos: ag * pesos.agendamento, stories: stories * pesos.story, google: google * pesos.google },
        total: ag * pesos.agendamento + stories * pesos.story + google * pesos.google,
      };
    }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

    fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
    const dados = { titulo: c.titulo, de: c.de, ate: c.ate, premios: c.premios || [300, 200, 100], pesos, atualizadoEm: new Date().toISOString(), ranking: linhas };
    fs.writeFileSync(SAIDA + '.tmp', JSON.stringify(dados, null, 1));
    fs.renameSync(SAIDA + '.tmp', SAIDA);
    console.log(`[ranking-publico] ${linhas.length} atendentes:`, linhas.map((l) => `${l.nome}=${l.total}`).join(', '));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('[ranking-publico] erro:', e?.message || e); process.exit(1); });
