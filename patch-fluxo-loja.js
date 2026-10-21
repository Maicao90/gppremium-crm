// Fluxo POR LOJA (21/10): cada loja tem os proprios textos (por cima do padrao geral) e os proprios dados
// (horario, endereco, pino, inicio do robo). Sem mudar o banco: a edicao da loja fica na mesma tabela
// FluxoResposta com a chave "loja:<lojaId>:<chave>"; os dados da loja ficam em data/bot-lojas.json.
const fs = require('fs');
function patch(f, trocas) {
  let s = fs.readFileSync(f, 'utf8');
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(f, 'ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  fs.writeFileSync(f, s); console.log(f, 'ok');
}

// ---------- rotas ----------
patch('src/routes/fluxo.ts', [
  ["import { VALOR_BALANCEAMENTO_POR_RODA, PARCELAS_MAXIMAS } from '../data/fluxoPreco';",
   "import { VALOR_BALANCEAMENTO_POR_RODA, PARCELAS_MAXIMAS } from '../data/fluxoPreco';\nimport { lerConfigLojasBot, salvarConfigLojaBot, CAMPOS_CONFIG_LOJA } from '../services/botLojas';\n\n// Edicao de UMA loja: chave \"loja:<lojaId>:<chave>\" na mesma tabela (o padrao geral continua sem prefixo).\nconst chaveDaLoja = (lojaId: string, chave: string) => `loja:${lojaId}:${chave}`;\nconst lojaDaReq = (req: any): string => String(req.query?.lojaId || req.body?.lojaId || '').trim().replace(/[^a-zA-Z0-9-]/g, '');"],

  [`router.get('/', async (req, res) => {
  try {
    const linhas = await prisma.fluxoResposta.findMany();
    const porChave = new Map(linhas.map((l) => [l.chave, l]));
    const categorias = CATALOGO_FLUXO.map((c) => {
      const edicao = c.partes ? porChave.get(c.chave) : undefined;
      const editadas = edicao ? lerPartes(edicao.partes) : null;
      return {
        ...c,
        atual: c.partes ? (editadas ?? c.partes) : null,
        personalizado: !!editadas,
        atualizadoEm: editadas && edicao ? edicao.atualizadoEm : null,
      };
    });
    res.json({ grupos: GRUPOS_FLUXO, categorias, podeEditar: ehMaster(String(req.user?.role || '')) });`,
`router.get('/', async (req, res) => {
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
    });`],

  // simular com os textos/dados da loja escolhida
  [`    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const textosFluxo: Record<string, string[]> = {};
    for (const l of linhas) { const p = jsonArray(l.partes); if (p.length) textosFluxo[l.chave] = p; }
`,
`    const lojaId = lojaDaReq(req);
    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const textosFluxo: Record<string, string[]> = {};
    for (const l of linhas) { if (l.chave.startsWith('loja:')) continue; const p = jsonArray(l.partes); if (p.length) textosFluxo[l.chave] = p; }
    if (lojaId) {
      for (const l of linhas) {
        const pref = \`loja:\${lojaId}:\`;
        if (!l.chave.startsWith(pref)) continue;
        const p = jsonArray(l.partes); if (p.length) textosFluxo[l.chave.slice(pref.length)] = p;
      }
    }
    const cfgLoja = lojaId ? lerConfigLojasBot()[lojaId] : null;
    const lojaBot = cfgLoja && cfgLoja.NOME_LOJA
      ? { nome: String(cfgLoja.NOME_LOJA), telefone: String(cfgLoja.TELEFONE || ''), horario: String(cfgLoja.HORARIO || ''), localizacao: String(cfgLoja.LOCALIZACAO || ''), localizacaoTexto: String(cfgLoja.LOCALIZACAO_TEXTO || '') }
      : undefined;
`],
  ["body: JSON.stringify({ messages, lojas: [], ultimosTextosCliente: mensagens.join('\\n'), estadoPreco: estado, dadosPreco: JSON.stringify(dados), textosFluxo, simular: true }),",
   "body: JSON.stringify({ messages, lojas: [], ultimosTextosCliente: mensagens.join('\\n'), estadoPreco: estado, dadosPreco: JSON.stringify(dados), textosFluxo, lojaBot, simular: true }),"],

  // PUT: salva na loja (se veio lojaId) ou no geral
  [`    const partes = Array.isArray(req.body?.partes) ? req.body.partes.map((p: unknown) => String(p ?? '').trim()) : req.body?.partes;
    const problemas = validarTextoFluxo(chave, partes);
    if (problemas.length) return res.status(400).json({ error: problemas.join(' '), problemas });
`,
`    const partes = Array.isArray(req.body?.partes) ? req.body.partes.map((p: unknown) => String(p ?? '').trim()) : req.body?.partes;
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
`],
  // DELETE: restaura o texto da loja (volta pro geral)
  [`    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });
    await prisma.fluxoResposta.deleteMany({ where: { chave } });
    res.json({ ok: true, personalizado: false, atual: cat.partes });`,
`    if (!cat || !cat.partes) return res.status(404).json({ error: 'Resposta não encontrada ou não editável.' });
    const lojaId = lojaDaReq(req);
    if (lojaId) {
      await prisma.fluxoResposta.deleteMany({ where: { chave: chaveDaLoja(lojaId, chave) } });
      const geral = await prisma.fluxoResposta.findUnique({ where: { chave } });
      return res.json({ ok: true, personalizado: false, atual: (geral && lerPartes(geral.partes)) || cat.partes });
    }
    await prisma.fluxoResposta.deleteMany({ where: { chave } });
    res.json({ ok: true, personalizado: false, atual: cat.partes });`],

  // dados da loja (horario, endereco, pino, inicio do robo...)
  ["router.put('/:chave', async (req, res) => {",
`// Dados do robo de UMA loja (data/bot-lojas.json). Ler: quem ve o Fluxo. Salvar: so o administrador.
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

router.put('/:chave', async (req, res) => {`],
]);

// ---------- dados da loja: ler/salvar com validacao ----------
const bl = 'src/services/botLojas.ts';
let s = fs.readFileSync(bl, 'utf8');
if (!s.includes('salvarConfigLojaBot')) {
  s += `
// ---------- edicao pelo painel (tela Fluxo) ----------
export const CAMPOS_CONFIG_LOJA = [
  { campo: 'NOME_LOJA', rotulo: 'Nome da loja (como o robô fala)', tipo: 'texto' },
  { campo: 'TELEFONE', rotulo: 'Telefone', tipo: 'texto' },
  { campo: 'HORARIO', rotulo: 'Horário (ex.: de segunda a sexta, das 8h às 18h, e aos sábados, das 8h às 12h)', tipo: 'texto' },
  { campo: 'LOCALIZACAO', rotulo: 'Endereço que vai no pino do mapa', tipo: 'texto_longo' },
  { campo: 'LOCALIZACAO_TEXTO', rotulo: 'Frase "a gente fica ..." (ex.: na Avenida Perimetral, em Luziânia-GO)', tipo: 'texto' },
  { campo: 'LOCALIZACAO_LAT', rotulo: 'Latitude do pino', tipo: 'numero' },
  { campo: 'LOCALIZACAO_LNG', rotulo: 'Longitude do pino', tipo: 'numero' },
  { campo: 'ROBO_INICIO', rotulo: 'Robô começa a responder às (HH:MM; vazio = o dia todo)', tipo: 'hora' },
  { campo: 'PAUSA_FORA_DA_LISTA_MIN', rotulo: 'Pneu fora da tabela: robô fica quieto por (minutos)', tipo: 'numero' },
];

export function lerConfigLojasBot(): Record<string, any> {
  const j = lerJson(CAMINHO_LOJAS);
  return j && typeof j === 'object' ? j : {};
}

export function salvarConfigLojaBot(lojaId: string, entrada: Record<string, unknown>): { config?: any; erro?: string } {
  const todas = lerConfigLojasBot();
  const atual = { ...(todas[lojaId] || {}) };
  for (const { campo, tipo } of CAMPOS_CONFIG_LOJA) {
    if (!(campo in entrada)) continue;
    const v = entrada[campo];
    if (v === null || v === undefined || String(v).trim() === '') { delete atual[campo]; continue; }
    if (tipo === 'numero') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n)) return { erro: \`Valor inválido em "\${campo}".\` };
      atual[campo] = n;
    } else if (tipo === 'hora') {
      if (!/^([01]?\\d|2[0-3]):[0-5]\\d$/.test(String(v).trim())) return { erro: 'Horário de início no formato HH:MM (ex.: 10:30).' };
      atual[campo] = String(v).trim();
    } else {
      atual[campo] = String(v).slice(0, 600);
    }
  }
  todas[lojaId] = atual;
  const tmp = CAMINHO_LOJAS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(todas, null, 2));
  fs.renameSync(tmp, CAMINHO_LOJAS);
  return { config: atual };
}
`;
  fs.writeFileSync(bl, s); console.log(bl, 'ok');
}

// ---------- robo: textos da loja por cima do geral ----------
patch('src/workers/botAtendimentoService.ts', [
  [`async function carregarTextosFluxo(): Promise<Record<string, string[]>> {
  try {
    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const saida: Record<string, string[]> = {};
    for (const l of linhas) {
      try {
        const partes = JSON.parse(l.partes);
        if (Array.isArray(partes)) saida[l.chave] = partes.map(String);
      } catch { /* linha corrompida: ignora, usa o padrao */ }
    }
    return saida;`,
`async function carregarTextosFluxo(lojaId?: string | null): Promise<Record<string, string[]>> {
  try {
    const linhas = await prisma.fluxoResposta.findMany({ select: { chave: true, partes: true } });
    const saida: Record<string, string[]> = {};
    const daLoja: Record<string, string[]> = {};
    const pref = lojaId ? \`loja:\${lojaId}:\` : null;
    for (const l of linhas) {
      try {
        const partes = JSON.parse(l.partes);
        if (!Array.isArray(partes)) continue;
        // 21/10: texto proprio da loja ("loja:<id>:<chave>") ganha do geral; texto de OUTRA loja nao entra.
        if (l.chave.startsWith('loja:')) { if (pref && l.chave.startsWith(pref)) daLoja[l.chave.slice(pref.length)] = partes.map(String); continue; }
        saida[l.chave] = partes.map(String);
      } catch { /* linha corrompida: ignora, usa o padrao */ }
    }
    return { ...saida, ...daLoja };`],
  ["      textosFluxo: await carregarTextosFluxo(),\n      lojaBot:", "      textosFluxo: await carregarTextosFluxo(cfgLoja.lojaId),\n      lojaBot:"],
]);
