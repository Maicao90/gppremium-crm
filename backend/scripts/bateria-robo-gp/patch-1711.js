// Correcoes de 17/11 (conversas reais de 14-16/11). Uso: node patch-1711.js <caminho do server.ts>
// Cada troca exige que a ancora exista UMA vez; se nao achar, para sem gravar nada.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 17/11')) { console.log('ja aplicado'); process.exit(0); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

// P1 — largura digitada errada ("176/65 14"): largura de pneu termina em 5; 4 ou 6 no final e erro de digitacao.
troca('P1 largura digitada',
`function corrigirPerfilDigitado(t: string): string {
  return String(t || '').replace(`,
`// CORRECOES 17/11 (Luiz: "176/65 14" foi pra atendente tendo 175/65/14): largura com final 4 ou 6 = erro de digitacao.
function corrigirLarguraDigitada(t: string): string {
  return String(t || '').replace(/(?<![\\d$.,])(1[3-9]|2\\d|3[0-3])([46])(\\s*[\\/xX\\-]\\s*[2-8][05])(?!\\d)/g, (_todo, ini, _fim, resto) => \`\${ini}5\${resto}\`);
}
function corrigirPerfilDigitado(t0: string): string {
  // Durao 14/11: "265 /70' 16" — o apostrofo no meio da medida fazia o robo ignorar a segunda medida.
  const t = corrigirLarguraDigitada(String(t0 || '').replace(/(\\d)\\s*['’´"]+\\s*(?=\\d)/g, '$1 '));
  return String(t || '').replace(`);

// P4 — "Bom dia" + "A numeracao e 175/65": so falta o aro (a rajada tinha cumprimento junto e caia na IA livre).
troca('P4 so largura/perfil com cumprimento',
`      const lp = rajadaSoLarguraPerfil(rajada);`,
`      const rajadaSemCumprimento = rajada.filter((t: string) => !/^(oi+|ol[aá]|opa|bom dia|boa tarde|boa noite|e a[ií]|tudo (bem|bom))[\\s,!.?]*$/i.test(String(t).trim()));
      const lpSolta = !medidasEscritas.length && partesMedida.larguraPerfil && (partesMedida as any).larguraPerfilNaRajada && rajadaSemCumprimento.length === 1 && !/\\?/.test(rajadaSemCumprimento[0] || '') && String(rajadaSemCumprimento[0] || '').length <= 60 ? partesMedida.larguraPerfil : null;
      const lp = rajadaSoLarguraPerfil(rajada) || rajadaSoLarguraPerfil(rajadaSemCumprimento) || lpSolta;`);

// P2 — abertura que ja diz o carro ("4 pneus aro 14 para um fiesta 2011") nao recebe "qual o seu carro?": IA descobre a medida.
troca('P2 carro citado nao pede o carro de novo',
`          if (decisao.acaoPrincipal !== 'NADA' && !naoEhSoAgradecer && !ignorariaAFoto) {`,
`          const pediriaMedidaComCarroCitado = !!lb && iaLivreRestrita(lb.nome) && decisao.chaves.some((c) => c === 'pedir_medida' || c === 'pedir_medida_repetida')
            && !decisao.chaves.includes('preco_medida') && !dadosUsados.medida && !medidasEscritas.length && !medidaJuntada
            && (CARROS_BR.test(gatilho) || /\\b(19[89]\\d|20[0-2]\\d)\\b/.test(gatilho));
          if (pediriaMedidaComCarroCitado) console.log('[BotService] cliente ja disse o carro — nao pede de novo; IA livre descobre a medida.');
          if (decisao.acaoPrincipal !== 'NADA' && !naoEhSoAgradecer && !ignorariaAFoto && !pediriaMedidaComCarroCitado) {`);
troca('P2b motivo',
`          motivoLivre = ignorariaAFoto ? 'midia_sem_texto' : decisao.assuntos.includes('PERGUNTA_TECNICA') ? 'pergunta_tecnica' : 'assunto_sem_bloco';`,
`          motivoLivre = ignorariaAFoto ? 'midia_sem_texto' : pediriaMedidaComCarroCitado ? 'carro_citado' : decisao.assuntos.includes('PERGUNTA_TECNICA') ? 'pergunta_tecnica' : 'assunto_sem_bloco';`);

// P3 — "Ata" / "ah ta" / "entendi" / "certo" sozinho e so um aceno: agradece uma vez e para (a IA livre repetia o texto do anuncio).
troca('P3 aceno',
`      if (pareceAgradecimento(gatilho)) {
        const textoRecente = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content || '')).join('\\n');`,
`      const soAceno = rajada.length > 0 && rajada.every((t: string) => /^(a+ta+|ah*\\s*t[aá]+|a+h*\\s*sim|ah+|hum+|uhum|aham|sei|certo|entendi|show|top|j[oó]ia|t[aá]+|t[aá]\\s*(bom|certo|ok)|ok+|blz|beleza|massa|perfeito|[👍🤝🙏👌]+)[\\s!.,]*$/iu.test(String(t).trim()));
      if (pareceAgradecimento(gatilho) || soAceno) {
        const textoRecente = anteriores.filter((m: any) => m?.role === 'assistant').slice(-6).map((m: any) => String(m?.content || '')).join('\\n');`);

// P5 — as travas cortaram a resposta inteira: cliente que nao estava so agradecendo NUNCA fica sem resposta.
troca('P5 nunca mudo',
`        console.error('[BotService][TRAVA DE REPETICAO] A segunda tentativa tambem foi cortada pelas travas — silencio (o cliente ja tinha essa resposta).');`,
`        if (rabo.length && !pareceAgradecimento(gatilho)) {
          const medidaSegura = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
          const cot = medidaSegura ? decidirSequenciaPreco([{ intencao: 'DAR_MEDIDA', medidaExtraida: medidaSegura, quantidadeExtraida: dadosPrecoAtuais.quantidade ?? null, escolhaAlternativa: null } as any], 'preco_confirmado', dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true }) : null;
          const segura = cot && cot.partes.length ? cot.partes.filter((p: string) => !/^\\[ENVIAR_[A-Z_]+/i.test(p.trim())) : textoFluxo(textosFluxo, 'pedir_medida');
          console.error('[BotService][TRAVA DE REPETICAO] As duas tentativas foram cortadas — resposta fixa pra nao deixar o cliente sem resposta.');
          return res.json({ partes: segura, deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', assuntos: assuntosLidos, chaves: ['resposta_segura'], rajada });
        }
        console.error('[BotService][TRAVA DE REPETICAO] A segunda tentativa tambem foi cortada pelas travas — silencio (o cliente ja tinha essa resposta).');`);

// P6 — cliente que ja disse que e de fora / ja comprou / desistiu volta com "bom dia": nao "vamos seguir com o seu orcamento?".
troca('P6 retorno de quem ja encerrou',
`    let jaGarantia = FALA_GARANTIA.test(ditasAntes), jaLoja = false;`,
`    if (Array.isArray(body.chaves) && body.chaves.includes('saudacao_retorno')) {
      const doCliente = lista.filter((m: any) => m?.role === 'user').slice(-12).map((m: any) => String(m?.content || '')).join('\\n');
      const lojaEncerrou = /n[aã]o trabalhamos com entregas?|se voc[eê] passar por Luzi[aâ]nia/i.test(ditasAntes);
      const clienteEncerrou = /j[aá] comprei|comprei (a[ií]|aqui|em|n[oa]|l[aá]|outro)|j[aá] (coloquei|troquei|resolvi)|troquei de carro|vendi o carro|n[aã]o (vou|vai) (mais )?(precisar|querer)|n[aã]o consigo (ir|buscar)|muito longe|moro em (bras[ií]lia|goi[aâ]nia|s[aã]o paulo|outr[ao])|n[aã]o (fazem|faz|tem) entrega/i.test(doCliente);
      if (lojaEncerrou || clienteEncerrou) {
        const saida: any = { ...body, partes: ['Oi, tudo bem? 😊 Em que posso te ajudar?'], acaoTipo: 'RESPONDER_SAUDACAO', chaves: ['saudacao_retorno_neutra'] };
        for (const k of Object.keys(saida)) if (/audio/i.test(k)) delete saida[k];
        return saida;
      }
    }
    let jaGarantia = FALA_GARANTIA.test(ditasAntes), jaLoja = false;`);

// P9 — LEAD DO ANUNCIO CAIA NA IA LIVRE (simulacao de 1.000 conversas: 96 casos). "Olá! vim do instagram e gostaria de fazer
// um orçamento": a palavra "do" contava como "citou o carro". Agora so conta carro de verdade (modelo, ano, "carro").
troca('P9 abertura do anuncio',
`        const citaCarro = /\\b(pra|pro|para|do|da|meu|minha|carro|ve[ií]culo|modelo|ano)\\b|\\b(19|20)\\d{2}\\b/i.test(gatilho);`,
`        const citaCarro = CARROS_BR.test(gatilho) || /\\b(carro|ve[ií]culo|caminhonete|camionete|picape)\\b|\\b(19[89]\\d|20[0-2]\\d)\\b/i.test(gatilho);`);
troca('P9b abertura em ingles do anuncio',
`      const pedePneuNaAbertura = estadoPrecoAtual === 'sem_estado' && /\\b(pneus?|or[çc]amentos?|aro|medida)\\b/i.test(gatilho);`,
`      const pedePneuNaAbertura = estadoPrecoAtual === 'sem_estado' && (/\\b(pneus?|or[çc]amentos?|aro|medida)\\b/i.test(gatilho) || /i'?m interested|can i (learn|get|have) more|more info|tenho interesse|quero saber mais|mais informa[cç][oõ]es/i.test(gatilho));`);

// P10 e P11 — perguntas que o Cerebro ensina a responder, mas so como "orientacao" pra IA (que nem sempre seguia):
// "esse e o mais em conta?" (o fluxo repetia o preco) e "ja e instalado?" (caia na IA livre). Agora sao texto fixo.
troca('P10/P11 mais em conta e montagem',
`    // 30/10: "nao" a confirmacao da medida ouvida no audio: pede escrita ou foto, nunca cota a medida errada.`,
`    if (lb && iaLivreRestrita(lb.nome) && rajada.length) {
      const dito = rajada.join('\\n');
      const medidaCotada = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
      const lojaJaDeuPreco = anteriores.filter((m: any) => m?.role === 'assistant').slice(-8).some((m: any) => /R\\$\\s*\\d/.test(String(m?.content ?? '')));
      const baseFixa = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', rajada, simulado: !!req.body?.simular };
      const semOutraMedida = !medidasEscritasNaRajada(rajada).length;
      if (medidaCotada && lojaJaDeuPreco && semOutraMedida && /(mais em conta|mais barat[oa]|melhor pre[cç]o|menor pre[cç]o|[uú]nico pre[cç]o|[uú]ltimo pre[cç]o)/i.test(dito) && /\\?|\\b([eé]|tem)\\b/i.test(dito) && !/outr[ao]s? (marca|loja|lugar)|internet|achei|vi por|encontrei|concorr/i.test(dito)) {
        return res.json({ ...baseFixa, partes: [\`Sim, esse é o valor que temos pra medida \${medidaCotada}.\`, 'Aqui a gente trabalha só com o GP Premium, que é remold de primeira linha, com garantia de 2 anos e 60 mil km.', 'Quando você consegue passar aqui na loja?'], acaoTipo: 'RESPONDER_MAIS_EM_CONTA', assuntos: ['MAIS_EM_CONTA'], chaves: ['mais_em_conta'] });
      }
      if (semOutraMedida && /(j[aá] ([eé] |est[aá] |vem |sai )?(instalad|montad|colocad)|com (a )?(montagem|instala[cç][aã]o)|(montagem|instala[cç][aã]o) ([eé] |[eé] por |sai )?(gr[aá]tis|inclus|por conta|cobrad|de gra[cç]a)|cobra(m)? (a |pela |pra )?(montagem|montar|instalar)|ganha a montagem)/i.test(dito) && !/alinh|balanc|cambag/i.test(dito)) {
        return res.json({ ...baseFixa, partes: ['Sim! No GP Premium a montagem é por nossa conta 😉', ...(medidaCotada && lojaJaDeuPreco ? ['Quando você consegue passar aqui na loja pra gente fazer a troca?'] : [])], acaoTipo: 'RESPONDER_MONTAGEM', assuntos: ['MONTAGEM'], chaves: ['montagem'] });
      }
    }
    // 30/10: "nao" a confirmacao da medida ouvida no audio: pede escrita ou foto, nunca cota a medida errada.`);

// P8 — HORARIO DE FUNCIONAMENTO (dono 17/11: "passa tudo errado mandando o cliente vir fora de hora"). O robo confirmava
// visita ("Combinado! Te esperamos") com a loja fechada (domingo 15/11, Romario: "pode ser hoje mesmo"). Agora o codigo
// confere o dia e a hora antes de confirmar, e responde "estamos abertos?" com a situacao de AGORA.
troca('P8 funcoes de horario',
`let nomeAtendenteGuarda = 'Josy';`,
`let nomeAtendenteGuarda = 'Josy';
// Minutos desde 00:00 em que a loja abre e fecha, por dia da semana (0 = domingo). null = nao abre.
// ⚠️ Conferir com o dono: hoje reflete o texto do fluxo ("Segunda a sexta de 08h às 18h, Sábado de 08h às 12h").
const FUNCIONAMENTO_GP: Record<number, [number, number] | null> = { 0: null, 1: [480, 1080], 2: [480, 1080], 3: [480, 1080], 4: [480, 1080], 5: [480, 1080], 6: [480, 720] };
const NOME_DIA_FUNC = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function horaCurta(m: number): string { const h = Math.floor(m / 60), r = m % 60; return r ? \`\${h}h\${String(r).padStart(2, '0')}\` : \`\${h}h\`; }
function funcionamentoAgora(agora: Date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value || '';
  const semana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  const min = (Number(v('hour')) % 24) * 60 + Number(v('minute'));
  const hoje = FUNCIONAMENTO_GP[semana] || null;
  const abertoAgora = !!hoje && min >= hoje[0] && min < hoje[1];
  const abreMaisTardeHoje = !!hoje && min < hoje[0];
  let n = 1; while (n < 8 && !FUNCIONAMENTO_GP[(semana + n) % 7]) n++;
  const prox = (semana + n) % 7;
  const proxH = FUNCIONAMENTO_GP[prox] || [480, 1080];
  const proximoRotulo = n === 1 ? 'amanhã' : \`\${prox === 6 || prox === 0 ? 'no' : 'na'} \${NOME_DIA_FUNC[prox]}\`;
  return { semana, hoje, abertoAgora, abreMaisTardeHoje, fechadoPeloRestoDoDia: !abertoAgora && !abreMaisTardeHoje, amanhaFechado: !FUNCIONAMENTO_GP[(semana + 1) % 7], proximoRotulo, proximoAbre: horaCurta(proxH[0]), nomeHoje: NOME_DIA_FUNC[semana] || '' };
}
function guardaHorarioFuncionamento(body: any, messages: any[], textosFluxo: any, agoraIso?: string): any {
  try {
    if (!body || !Array.isArray(body.partes)) return body;
    if (!body.partes.length && body.via !== 'ia_livre') return body; // silencio decidido pelo codigo continua silencio
    const lista = Array.isArray(messages) ? messages : [];
    const doCliente: string[] = [];
    for (let i = lista.length - 1; i >= 0; i--) { if (lista[i]?.role !== 'user') break; doCliente.unshift(String(lista[i]?.content || '')); }
    const txt = doCliente.join(' \\n ');
    if (!txt.trim()) return body;
    const agora = agoraIso && !isNaN(Date.parse(agoraIso)) ? new Date(agoraIso) : new Date();
    const f = funcionamentoAgora(agora);
    const horario = (textoFluxo(textosFluxo, 'horario') || []).join(' ');
    const resp = body.partes.join(' \\n ');
    const semAudio = (o: any) => { for (const k of Object.keys(o)) if (/audio/i.test(k)) delete o[k]; return o; };
    const confirmaVisita = /Combinado|Te esperamos|te espero|satisfa[cç][aã]o receber|Fica anotado/i.test(resp) || (Array.isArray(body.chaves) && body.chaves.some((c: string) => /^visita_/.test(c)));
    // Limites de palavra que funcionam com acento ("amanhã ", "aí"): \\b do JavaScript nao enxerga letra acentuada.
    const A = '(?<![A-Za-zÀ-ÿ0-9])', Z = '(?![A-Za-zÀ-ÿ0-9])';
    const vemHoje = new RegExp(A + '(hoje|hj|agora|j[aá] j[aá]|daqui a pouco|t[oô] indo|estou indo|indo a[ií]|chegando|mais tarde|[aà] tarde|de tarde)' + Z, 'i').test(txt);
    const vemAmanha = new RegExp(A + 'amanh[aã]' + Z, 'i').test(txt);
    // A resposta ia sair da IA livre (texto ainda nao escrito) e o cliente avisou que esta vindo: o codigo decide.
    const anunciaVinda = body.via === 'ia_livre' && new RegExp(A + '(t[oô]u? indo|estou indo|vou|passo|passar|chego|chegar|indo|ir a[ií]|pode ser)' + Z, 'i').test(txt) && !/\\?/.test(txt);
    const diaVisita = body.visita?.iso ? new Date(String(body.visita.iso) + 'T12:00:00Z').getUTCDay() : -1;
    const diaVisitaFechado = diaVisita >= 0 && !FUNCIONAMENTO_GP[diaVisita];
    if (confirmaVisita || anunciaVinda) {
      let motivo = '';
      let convite = 'Consegue vir em outro dia?';
      if (diaVisitaFechado && body.visita?.diasAte !== 0) motivo = \`\${diaVisita === 0 ? 'No domingo' : 'Nesse dia'} a gente não abre 😕\`;
      else if (vemHoje && !vemAmanha && f.fechadoPeloRestoDoDia) { motivo = f.hoje ? 'Hoje a gente já fechou 😕' : \`Hoje (\${f.nomeHoje}) a gente não abre 😕\`; convite = \`Consegue vir \${f.proximoRotulo}? A gente abre às \${f.proximoAbre}.\`; }
      else if (vemAmanha && !vemHoje && f.amanhaFechado) motivo = 'Amanhã a gente não abre 😕';
      if (motivo) {
        console.log(\`[BotService][Horario] visita em dia/hora fechado ("\${txt.slice(0, 80)}") — corrige em vez de confirmar.\`);
        return semAudio({ ...body, partes: [motivo, ...(horario ? [horario] : []), convite], acaoTipo: 'RESPONDER_HORARIO', chaves: ['loja_fechada'], visita: null, deterministico: true });
      }
    }
    const perguntaSeAbre = PERGUNTA_HORARIO.test(txt) || /\\b(abert[oa]s?|funcionando|atendendo|trabalhando|trabalham)\\b/i.test(txt);
    if (perguntaSeAbre && /\\b(hoje|hj|agora)\\b/i.test(txt) && (body.partes.length || body.via === 'ia_livre')) {
      const status = f.abertoAgora && f.hoje ? \`Estamos abertos agora, até as \${horaCurta(f.hoje[1])} 😊\`
        : f.abreMaisTardeHoje && f.hoje ? \`Hoje a gente abre às \${horaCurta(f.hoje[0])} 😊\`
        : f.hoje ? \`Hoje a gente já fechou. Abrimos \${f.proximoRotulo} às \${f.proximoAbre}.\`
        : \`Hoje (\${f.nomeHoje}) a gente não abre. Abrimos \${f.proximoRotulo} às \${f.proximoAbre}.\`;
      if (!resp.includes(status)) {
        return semAudio({ ...body, partes: horario ? [status, horario] : [status, ...body.partes], acaoTipo: 'RESPONDER_HORARIO', chaves: ['horario', 'status_aberto'], visita: null, deterministico: true });
      }
    }
  } catch { /* segue sem a guarda de horario */ }
  return body;
}`);
troca('P8b chama a guarda de horario',
`      (res as any).json = (body: any) => jsonOriginal(guardaRespostaRestrita(body, messages, textosFluxo));`,
`      (res as any).json = (body: any) => jsonOriginal(guardaHorarioFuncionamento(guardaRespostaRestrita(body, messages, textosFluxo), messages, textosFluxo, req.body?.simular || req.body?.teste ? req.body?.agoraTeste : undefined));`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora de "${t.nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log(`aplicadas ${trocas.length} trocas em ${arq}`);
