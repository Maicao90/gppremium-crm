// LOTE 2 (17/11, simulacao de 1.000 conversas reais — o que ainda caia na IA livre). Uso: node patch-1711c.js <server.ts>
//  C1 CARRO -> MEDIDAS: cliente diz so o carro ("Palio 2016", "tem pneu pro Kwid?"). Antes a IA livre "descobria" a medida.
//     Agora o codigo mostra as medidas mais comuns daquele carro (tabela montada com o historico da propria loja: o que
//     foi cotado quando o cliente disse o carro, 11 mil conversas) com o preco da tabela, e pede pra conferir na lateral.
//  C2 RUIDO: "kkkk", emoji sozinho, letra solta, "templateMessage" -> silencio (a IA livre respondia qualquer coisa).
//  C3 "Sim"/"Estou sim" respondendo ao 🙋 da retomada: com medida conhecida cota; sem medida pede a medida.
const fs = require('fs');
const arq = process.argv[2];
let s = fs.readFileSync(arq, 'utf8');
if (s.includes('CORRECOES 17/11c')) { console.log('ja aplicado'); process.exit(0); }
if (!s.includes('CORRECOES 17/11b')) { console.error('FALHOU: aplique antes patch-1711.js e patch-1711b.js'); process.exit(1); }
const trocas = [];
const troca = (nome, de, para) => trocas.push({ nome, de, para });

troca('import brl',
`  encontrarPrecosExatosPorMedida,
} from '../data/tabelaPrecos';`,
`  encontrarPrecosExatosPorMedida,
  brl,
} from '../data/tabelaPrecos';`);

troca('tabela de carros',
`let nomeAtendenteGuarda = 'Josy';`,
`let nomeAtendenteGuarda = 'Josy';
// CORRECOES 17/11c — CARRO -> MEDIDAS MAIS COMUNS. So entra medida que a loja ja cotou pra esse carro no historico e que
// e medida original conhecida do modelo. Na hora de responder, so aparecem as que estao na tabela de precos.
const CARRO_MEDIDAS: Record<string, { nome: string; medidas: string[] }> = {
  gol: { nome: 'Gol', medidas: ['175/65/14', '175/70/14', '185/60/15'] },
  voyage: { nome: 'Voyage', medidas: ['175/70/14', '185/60/15', '195/55/15'] },
  saveiro: { nome: 'Saveiro', medidas: ['175/70/14', '195/55/15', '205/60/15'] },
  fox: { nome: 'Fox', medidas: ['175/65/14', '195/55/15'] },
  virtus: { nome: 'Virtus', medidas: ['195/65/15', '205/55/16'] },
  tcross: { nome: 'T-Cross', medidas: ['205/60/16', '205/55/17'] },
  uno: { nome: 'Uno', medidas: ['175/70/13', '165/70/13', '175/65/14'] },
  palio: { nome: 'Palio', medidas: ['175/65/14', '175/70/13', '175/70/14'] },
  siena: { nome: 'Siena', medidas: ['175/65/14', '175/70/13'] },
  strada: { nome: 'Strada', medidas: ['175/70/14'] },
  mobi: { nome: 'Mobi', medidas: ['175/65/14', '165/70/14'] },
  argo: { nome: 'Argo', medidas: ['175/65/14', '185/60/15', '205/60/15'] },
  cronos: { nome: 'Cronos', medidas: ['185/60/15', '195/55/16', '175/65/14'] },
  punto: { nome: 'Punto', medidas: ['185/65/15', '195/55/16'] },
  fiorino: { nome: 'Fiorino', medidas: ['175/70/14'] },
  toro: { nome: 'Toro', medidas: ['215/65/16', '225/65/17'] },
  celta: { nome: 'Celta', medidas: ['175/70/13', '165/70/13', '175/65/14'] },
  corsa: { nome: 'Corsa', medidas: ['165/70/13', '175/70/13', '175/65/14'] },
  onix: { nome: 'Onix', medidas: ['185/70/14', '185/65/15'] },
  prisma: { nome: 'Prisma', medidas: ['185/70/14', '185/65/15'] },
  spin: { nome: 'Spin', medidas: ['195/65/15'] },
  cobalt: { nome: 'Cobalt', medidas: ['195/65/15'] },
  vectra: { nome: 'Vectra', medidas: ['195/65/15', '205/55/16'] },
  astra: { nome: 'Astra', medidas: ['195/60/15', '195/65/15', '205/55/16'] },
  tracker: { nome: 'Tracker', medidas: ['215/55/17'] },
  s10: { nome: 'S10', medidas: ['245/70/16', '265/70/16'] },
  hb20: { nome: 'HB20', medidas: ['175/70/14', '185/60/15'] },
  hb20s: { nome: 'HB20S', medidas: ['175/70/14', '185/60/15'] },
  creta: { nome: 'Creta', medidas: ['205/65/16', '215/60/17'] },
  i30: { nome: 'i30', medidas: ['205/55/16', '225/45/17'] },
  tucson: { nome: 'Tucson', medidas: ['215/65/16', '235/60/16', '225/60/17'] },
  ix35: { nome: 'ix35', medidas: ['225/60/17', '225/55/18'] },
  kwid: { nome: 'Kwid', medidas: ['165/70/14'] },
  sandero: { nome: 'Sandero', medidas: ['185/65/15', '175/65/14'] },
  logan: { nome: 'Logan', medidas: ['185/65/15'] },
  duster: { nome: 'Duster', medidas: ['215/65/16'] },
  ka: { nome: 'Ka', medidas: ['175/65/14', '195/55/15'] },
  fiesta: { nome: 'Fiesta', medidas: ['175/65/14', '195/55/15'] },
  focus: { nome: 'Focus', medidas: ['195/60/15', '205/55/16'] },
  ranger: { nome: 'Ranger', medidas: ['265/65/17', '255/70/16', '265/60/18'] },
  corolla: { nome: 'Corolla', medidas: ['205/55/16', '195/65/15'] },
  etios: { nome: 'Etios', medidas: ['175/65/14', '185/60/15'] },
  hilux: { nome: 'Hilux', medidas: ['265/65/17', '265/60/18', '265/70/16'] },
  civic: { nome: 'Civic', medidas: ['205/55/16', '215/50/17'] },
  hrv: { nome: 'HR-V', medidas: ['215/55/17'] },
  versa: { nome: 'Versa', medidas: ['185/65/15', '195/55/16'] },
  march: { nome: 'March', medidas: ['165/70/14', '185/60/15'] },
  kicks: { nome: 'Kicks', medidas: ['205/60/16', '205/55/17'] },
  sentra: { nome: 'Sentra', medidas: ['205/55/16'] },
  renegade: { nome: 'Renegade', medidas: ['215/65/16', '215/60/17', '225/55/18'] },
  compass: { nome: 'Compass', medidas: ['225/60/17', '225/55/18'] },
};
// Nomes que tambem sao palavra comum: so valem como carro com contexto (a loja perguntou o carro, ou a frase fala de pneu/carro).
const CARRO_AMBIGUO = ['ka', 'fox', 'uno', 'march', 'focus', 'spin', 'gol', 'toro', 'argo', 'logan', 'compass'];
function normalizarCarroTexto(t: string): string {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/hb ?-?20 ?s\\b/g, 'hb20s').replace(/hb ?-?20/g, 'hb20').replace(/s ?-?10\\b/g, 's10').replace(/hr ?-?v\\b/g, 'hrv')
    .replace(/t ?-?cross/g, 'tcross').replace(/ix ?-?35/g, 'ix35').replace(/grand siena/g, 'siena').replace(/novo /g, '');
}
const RE_CARRO_MEDIDAS = new RegExp('(?<![a-z0-9])(' + Object.keys(CARRO_MEDIDAS).sort((a, b) => b.length - a.length).join('|') + ')(?![a-z0-9])', 'g');
function carroDaRajada(rajada: string[], lojaPerguntouCarro: boolean): { chave: string; nome: string; medidas: string[] } | null {
  const t = normalizarCarroTexto(rajada.join(' \\n '));
  const achados: string[] = [];
  const re = new RegExp(RE_CARRO_MEDIDAS.source, 'g');
  for (let mm = re.exec(t); mm; mm = re.exec(t)) { const c = mm[1] as string; if (!achados.includes(c)) achados.push(c); }
  // HB20 e HB20S sao o mesmo carro pra esta tabela.
  const distintos = achados.filter((c) => !(c === 'hb20' && achados.includes('hb20s')));
  if (distintos.length !== 1) return null;
  const chave = distintos[0] as string;
  if (CARRO_AMBIGUO.includes(chave)) {
    const contexto = lojaPerguntouCarro || /(carro|pneu|meu|minha|modelo|\\bano\\b|\\b(19[89]\\d|20[0-2]\\d)\\b|\\bg[2-7]\\b|\\b1\\.[0-9]\\b)/.test(t) || t.replace(/[^a-z0-9]/g, '').length <= chave.length + 6;
    if (!contexto) return null;
  }
  const c = CARRO_MEDIDAS[chave];
  return c ? { chave, nome: c.nome, medidas: c.medidas } : null;
}
function precoDaMedida(medida: string): { texto: string } | null {
  const itens = encontrarPrecosExatosPorMedida(medida);
  if (!itens.length) return null;
  const valores = itens.map((i) => i.aVista).sort((a, b) => a - b);
  const menor = valores[0] as number;
  return { texto: \`\${valores.some((v) => v !== menor) ? 'a partir de ' : ''}R$ \${brl(menor)} à vista\` };
}`);

troca('bloco do lote 2',
`    if (lb && iaLivreRestrita(lb.nome) && rajada.length) {
      const dito = rajada.join('\\n');`,
`    // CORRECOES 17/11c (lote 2)
    if (lb && iaLivreRestrita(lb.nome) && rajada.length && rabo.length) {
      const baseL2 = { deterministico: true, novoEstadoPreco: estadoPrecoAtual, novosDadosPreco: JSON.stringify(dadosPrecoAtuais), via: 'fluxo', rajada, simulado: !!req.body?.simular };
      const lojaRecentes = anteriores.filter((m: any) => m?.role === 'assistant').slice(-3).map((m: any) => String(m?.content ?? ''));
      const ultimaLojaL2 = lojaRecentes[lojaRecentes.length - 1] || '';
      const ultUserL2 = String([...messages].reverse().find((m: any) => m?.role === 'user')?.content ?? '');
      const temMidiaL2 = (!!imagem && !LEGENDA_ANUNCIO.test(ultUserL2)) || !!audio?.base64 || rabo.some((t: string) => /^\\[[^\\]]+\\]$/.test(String(t).trim()));
      // C2 — ruido: risada, emoji sozinho, letra solta, aviso de sistema do WhatsApp. Nao e pergunta: silencio.
      const RUIDO = /^(k{2,}|(?:ha|he|hu|ka){2,}h?|rs(?:rs)*|[a-mo-rt-z]|templateMessage|secretEncryptedMessage|protocolMessage|[\\p{Extended_Pictographic}\\p{Emoji_Modifier}\\u200d\\ufe0f\\s]+)$/iu;
      if (!temMidiaL2 && rabo.every((t: string) => RUIDO.test(String(t).trim()))) {
        return res.json({ ...baseL2, partes: [], acaoTipo: 'SILENCIO', assuntos: [], chaves: ['ruido'] });
      }
      const medidaConhecidaL2 = [dadosPrecoAtuais.medida, medidaDoHistorico(anteriores)].find((m) => !!m && encontrarPrecosExatosPorMedida(m).length > 0);
      // C3 — "Sim" / "Estou sim" respondendo ao 🙋 da retomada, sem medida conhecida: pede a medida (com medida, o bloco da retomada cota).
      if (!temMidiaL2 && !medidaConhecidaL2 && /^\\s*🙋/u.test(ultimaLojaL2) && rajada.every((t: string) => /^(sim+|s|ss|cim|estou( sim)?|t[oô]( sim)?|ainda (estou|t[oô])( precisando)?|preciso( sim)?|quero( sim)?|claro|isso|uhum|aham|opa)[\\s!.,😊👍🙏]*$/iu.test(String(t).trim()))) {
        return res.json({ ...baseL2, partes: textoFluxo(textosFluxo, 'pedir_medida'), acaoTipo: 'PEDIR_MEDIDA', novoEstadoPreco: 'aguardando_medida', assuntos: ['RETOMADA_SIM'], chaves: ['pedir_medida'] });
      }
      // C1b — a loja mostrou as medidas do carro e o cliente escolheu pelo aro ("aro 14", "a de 13") ou pela ordem.
      const msgOpcoes = lojaRecentes.find((t) => /medidas mais comuns são|medida mais comum é/i.test(t));
      if (msgOpcoes && !temMidiaL2 && !medidasEscritasNaRajada(rajada).length && rajada.join(' ').length <= 40) {
        const opcoes = extrairMedidasDoTexto(msgOpcoes);
        const txtEscolha = rajada.join(' ').toLowerCase();
        const aroEsc = /(?<!\\d)(1[2-9]|2[0-2])(?!\\d)/.exec(txtEscolha)?.[1];
        const ordem = /primeir/.test(txtEscolha) ? 0 : /segund/.test(txtEscolha) ? 1 : /terceir/.test(txtEscolha) ? 2 : -1;
        const doAro = aroEsc ? opcoes.filter((m) => m.endsWith('/' + aroEsc)) : [];
        const escolhida: string | null = (doAro.length === 1 ? doAro[0] : ordem >= 0 && opcoes[ordem] ? opcoes[ordem] : opcoes.length === 1 && /^(sim+|isso|essa|esse|[eé] essa|[eé] isso|essa mesmo|esse mesmo|isso mesmo|exato|correto)[\\s!.,]*$/i.test(txtEscolha.trim()) ? opcoes[0] : null) ?? null;
        if (escolhida) {
          console.log(\`[BotService] cliente escolheu \${escolhida} entre as medidas do carro ("\${rajada.join(' / ')}").\`);
          // Cota direto pela tabela (a leitura da IA chamava isso de "escolher alternativa" e o motor nao respondia).
          const cot = decidirSequenciaPreco([{ intencao: 'DAR_MEDIDA', medidaExtraida: escolhida, quantidadeExtraida: dadosPrecoAtuais.quantidade ?? null, escolhaAlternativa: null } as any], 'aguardando_medida', dadosPrecoAtuais, textosFluxo, { minutosDesdeLocalizacao, jaRespondidas: [], lojaFalouHaPouco: true });
          if (cot.partes.length && cot.chaves.includes('preco_medida')) {
            const partesCot = cot.partes.filter((p: string) => req.body?.audioFluxo === true || !/^\\[ENVIAR_AUDIO:[^\\]]+\\]$/i.test(p.trim()));
            if (cot.chaves.length === 1) partesCot.push((cot.novosDados as any)?.quantidade ? 'Quando você consegue passar aqui na loja pra gente fazer a troca?' : 'Quantos pneus você vai precisar? A montagem do GP Premium é por nossa conta 😉');
            return res.json({ ...baseL2, partes: partesCot, acaoTipo: cot.acaoPrincipal, novoEstadoPreco: cot.novoEstado, novosDadosPreco: JSON.stringify(cot.novosDados), assuntos: cot.assuntos, chaves: cot.chaves });
          }
          rajada.splice(0, rajada.length, escolhida);
        }
      }
      // C1 — so o carro, sem medida escrita e sem medida conhecida: medidas mais comuns do carro, com preco da tabela.
      const lojaPerguntouCarroL2 = /qual [eé] o (seu )?carro|qual (o )?(seu )?carro|modelo (e (o )?ano )?do seu carro|me fala qual [eé] o seu carro|me diz qual [eé] o seu carro|medida do pneu|medida dos pneus/i.test(lojaRecentes.join('\\n'));
      const ditoL2 = rajada.join('\\n');
      if (!temMidiaL2 && !medidaConhecidaL2 && !medidasEscritasNaRajada(rajada).length && !rajadaSoLarguraPerfil(rajada)
        && !/\\d{2,3}\\s*[\\/xX.\\-]\\s*\\d{2}/.test(ditoL2) && !/\\d{3}\\s+\\d{2}\\b/.test(ditoL2)
        && !/alinh|balanc|cambag|[oó]leo|freio|bateria|suspens|amortec|c[aâ]mara|calota|estepe|\\bstep\\b|vaga|curr[ií]culo/i.test(ditoL2)
        // Outra marca, pneu usado ou modelo especifico (ATR, Brutus...) tem regra propria (atendente / fluxo): a tabela de carros nao entra.
        && !/michelin|pirelli|goodyear|good ?year|bridgestone|continental|firestone|dunlop|xbri|westlake|\\bmarcas?\\b|semi ?nov|meia ?vida|usad[oa]s?|recapad|\\batr\\b|a\\/t\\b|h\\/t\\b|brutus|adventure|\\bmud\\b|lameir|cravud|off ?road/i.test(ditoL2)) {
        const carro = carroDaRajada(rajada, lojaPerguntouCarroL2);
        if (carro) {
          const aroDito = /(?:aro|roda|rodas)\\s*:?\\s*(1[2-9]|2[0-2])(?!\\d)/i.exec(ditoL2)?.[1];
          const naTabela = carro.medidas.filter((m) => !!precoDaMedida(m));
          const opcoes = aroDito ? naTabela.filter((m) => m.endsWith('/' + aroDito)) : naTabela;
          if (opcoes.length === 1) {
            const m = opcoes[0] as string;
            const dadosCarro: any = { ...dadosPrecoAtuais, medida: m };
            console.log(\`[BotService] carro \${carro.nome}\${aroDito ? ' aro ' + aroDito : ''} -> \${m} (tabela de carros).\`);
            return res.json({ ...baseL2, partes: [\`Pro \${carro.nome}, a medida mais comum é a *\${m}*, que sai por *\${precoDaMedida(m)?.texto}*.\`, 'Confere na lateral do pneu se é essa mesma 😉 Quantos pneus você vai precisar?'],
              acaoTipo: 'MEDIDAS_DO_CARRO', novoEstadoPreco: 'preco_confirmado', novosDadosPreco: JSON.stringify(dadosCarro), assuntos: ['CARRO'], chaves: ['carro_medidas'] });
          }
          if (opcoes.length > 1) {
            console.log(\`[BotService] carro \${carro.nome} -> \${opcoes.join(', ')} (tabela de carros).\`);
            return res.json({ ...baseL2, partes: [\`Pro \${carro.nome}, as medidas mais comuns são:\\n\${opcoes.map((m) => \`• *\${m}* — \${precoDaMedida(m)?.texto}\`).join('\\n')}\`, 'Qual é a do seu? A medida fica na lateral do pneu 😉'],
              acaoTipo: 'MEDIDAS_DO_CARRO', novoEstadoPreco: 'aguardando_medida', assuntos: ['CARRO'], chaves: ['carro_medidas'] });
          }
        }
      }
    }
    if (lb && iaLivreRestrita(lb.nome) && rajada.length) {
      const dito = rajada.join('\\n');`);

troca('C3 retomada pelo emoji',
`      if (/Ainda está precisando\\?|Vamos seguir com o seu orçamento\\?|^Entendi \\*?\\d{3}\\/\\d{2}\\/\\d{2}\\*?, é isso\\?/i.test(ultimaDaLoja)`,
`      if ((/Ainda está precisando\\?|Vamos seguir com o seu orçamento\\?|^Entendi \\*?\\d{3}\\/\\d{2}\\/\\d{2}\\*?, é isso\\?/i.test(ultimaDaLoja) || (/^\\s*🙋/u.test(ultimaDaLoja) && !!iaLivreRestrita(lb?.nome)))`);

for (const t of trocas) {
  const n = s.split(t.de).length - 1;
  if (n !== 1) { console.error(`FALHOU: ancora de "${t.nome}" apareceu ${n}x (esperado 1). Nada foi gravado.`); process.exit(1); }
}
for (const t of trocas) s = s.replace(t.de, () => t.para);
fs.writeFileSync(arq, s);
console.log(`aplicadas ${trocas.length} trocas (lote 2) em ${arq}`);
