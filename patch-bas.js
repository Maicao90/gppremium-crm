const fs = require('fs');
const f = 'src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.replace(a, () => b); };

// tipos
rep("type EnviarLocalizacao = (lat: number, lng: number, nome: string, endereco: string) => Promise<boolean>;",
  "type EnviarLocalizacao = (lat: number, lng: number, nome: string, endereco: string, fotoFachada?: string) => Promise<boolean>;\ntype Etiquetar = (etiqueta: { id: string; nome: string; cor?: number }) => Promise<boolean>;");
rep("  enviarLocalizacao: EnviarLocalizacao;\n",
  "  enviarLocalizacao: EnviarLocalizacao;\n  // Etiqueta do WhatsApp Business no chat (opcional: quem nao manda, o robo so nao etiqueta).\n  etiquetar?: Etiquetar;\n");

// pino + foto da loja do atendente
rep("  await params.enviarLocalizacao(loc.lat, loc.lng, loc.nome, loc.endereco).catch(() => {});",
  `  await params.enviarLocalizacao(loc.lat, loc.lng, loc.nome, loc.endereco, loc.foto).catch(() => {});`);
rep("async function dispararLocalizacaoDaLoja(params: AgendarBotParams) {\n  const loc = lerLocalizacaoLoja();",
  `async function dispararLocalizacaoDaLoja(params: AgendarBotParams) {
  // 21/10: pino e foto da LOJA do atendente (bot-lojas.json); sem bloco da loja, o config geral (como antes).
  const cfgLoja = await configBotDaLoja(params.usuarioId);
  const geral = lerLocalizacaoLoja();
  const loc = cfgLoja.porLoja && Number.isFinite(cfgLoja.LOCALIZACAO_LAT) && Number.isFinite(cfgLoja.LOCALIZACAO_LNG)
    ? { lat: cfgLoja.LOCALIZACAO_LAT as number, lng: cfgLoja.LOCALIZACAO_LNG as number, nome: cfgLoja.NOME_LOJA, endereco: cfgLoja.LOCALIZACAO, foto: caminhoFotoFachada(cfgLoja) }
    : (geral ? { ...geral, foto: undefined as string | undefined } : null);`);

// horario de inicio do robo (antes disso so as atendentes)
rep("    const ritmo = await ritmoDeLoop(params.usuarioId, params.chatJid);",
  `    // 21/10: loja com ROBO_INICIO (ex.: GP 10:30) — antes desse horario quem responde sao as atendentes.
    // O robo nao responde; quem ficar sem resposta e pego pelo Vigia depois do horario.
    const cfgLoja = await configBotDaLoja(params.usuarioId);
    if (antesDoInicioDoRobo(cfgLoja)) {
      console.log(\`[Bot IA] \${params.chatJid}: antes das \${cfgLoja.ROBO_INICIO} (\${cfgLoja.NOME_LOJA}) — atendente responde, robo fica quieto.\`);
      return;
    }

    const ritmo = await ritmoDeLoop(params.usuarioId, params.chatJid);`);

// dados da loja pro bot-service (textos e prompt da loja certa)
rep("      textosFluxo: await carregarTextosFluxo(),\n      minutosDesdeLocalizacao,",
  `      textosFluxo: await carregarTextosFluxo(),
      lojaBot: cfgLoja.porLoja ? { nome: cfgLoja.NOME_LOJA, telefone: cfgLoja.TELEFONE, horario: cfgLoja.HORARIO, localizacao: cfgLoja.LOCALIZACAO, localizacaoTexto: cfgLoja.LOCALIZACAO_TEXTO || '' } : undefined,
      minutosDesdeLocalizacao,`);
rep("  textosFluxo?: Record<string, string[]>;\n  minutosDesdeLocalizacao?: number | null;",
  "  textosFluxo?: Record<string, string[]>;\n  lojaBot?: { nome: string; telefone: string; horario: string; localizacao: string; localizacaoTexto: string };\n  minutosDesdeLocalizacao?: number | null;");

// pneu fora da tabela: "so um instante", etiqueta vermelha e a atendente assume
rep("    if (resposta.deterministico && resposta.partes.length) {\n",
  `    // 21/10 (GP): cliente pediu pneu que NAO esta na tabela. O robo so manda o audio "so um instante que vou
    // verificar", marca o chat com a etiqueta vermelha e para de responder nessa conversa: a atendente assume.
    const CHAVES_FORA_DA_LISTA = ['medida_inexistente', 'sem_alternativa'];
    if (cfgLoja.ETIQUETA_FORA_DA_LISTA && resposta.deterministico && (resposta.chaves || []).some((c) => CHAVES_FORA_DA_LISTA.includes(c))) {
      if (versoes.get(key) !== versao || !(await conversaLiberada(params.usuarioId, params.chatJid))) return;
      const audioOk = await enviarAudioDoFluxo(params, 'so-um-instante-verificando', 'Só um instante que eu vou verificar aqui pra você, tá bem?');
      if (!audioOk) await params.enviarParte('Só um instante que eu vou verificar aqui pra você, tá bem?', tempoDigitacao('Só um instante'));
      if (params.etiquetar) await params.etiquetar(cfgLoja.ETIQUETA_FORA_DA_LISTA).catch(() => false);
      const pausaMin = cfgLoja.PAUSA_FORA_DA_LISTA_MIN || 12 * 60;
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), pausadoAte: new Date(Date.now() + pausaMin * 60000), motivoPausa: 'fora_da_lista' },
        update: { ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), pausadoAte: new Date(Date.now() + pausaMin * 60000), motivoPausa: 'fora_da_lista' },
      }).catch(() => {});
      console.log(\`[Bot IA] \${params.chatJid}: pneu fora da tabela — etiqueta "\${cfgLoja.ETIQUETA_FORA_DA_LISTA.nome}" e robo pausado \${pausaMin} min (atendente assume).\`);
      await registrarEventoFluxo(params, resposta, estadoPrecoSalvo?.estadoPreco || 'sem_estado', ['[ENVIAR_AUDIO:so-um-instante-verificando]', '(etiqueta: atendente assume)']);
      return;
    }

    if (resposta.deterministico && resposta.partes.length) {
`);

// import
const linhas = s.split('\n');
const ultimoImport = linhas.reduce((acc, l, i) => (/^import /.test(l) ? i : acc), -1);
linhas.splice(ultimoImport + 1, 0, "import { configBotDaLoja, antesDoInicioDoRobo, caminhoFotoFachada } from '../services/botLojas';");
s = linhas.join('\n');
fs.writeFileSync(f, s);
console.log('ok');
