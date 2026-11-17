// 21/10 (casos Maurício e "<invoke" no WhatsApp):
// 1) bot-service: a resposta da IA livre as vezes vem com lixo antes do JSON ("<invoke ...>", cerca ```json) e
//    com quebra de linha crua dentro do texto — o JSON.parse falhava e o TEXTO CRU ia pro cliente. Agora acha o
//    {"partes": ...} em qualquer lugar, aceita quebra de linha dentro das frases, e se nao der pra ler nada sai.
// 2) worker: trava final antes de mandar (nunca manda bolha com cara de codigo).
// 3) worker: conversa que um ATENDENTE (pessoa) atendeu nas ultimas N horas (padrao 12, por loja no painel) e
//    dele — o robo nao entra. O robo nao ve o orcamento em foto nem os audios da atendente e contradizia ela.
//    Saudacao automatica do WhatsApp Business e o 🙋🏼‍♀️ de remarketing nao contam como atendimento.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== 1) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/bot-service/server.ts', [
  [`function parsearRespostaBot(payload: string): RespostaBotBridge {
  let texto = String(payload || '').trim();
  // Claude costuma embrulhar o JSON em \`\`\`json ... \`\`\` — tira a cerca antes de ler.
  texto = texto.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/, '').trim();
  if (!texto) return { partes: [] };
  try {
    const parsed = JSON.parse(texto);
    if (Array.isArray(parsed?.partes)) {
      return {
        partes: parsed.partes
          .map((parte: any) => String(parte || '').trim())
          .filter(Boolean)
          .slice(0, 4),
      };
    }
  } catch {}
  return { partes: [texto.slice(0, 3500)] };
}`,
`// Bolha com cara de codigo nunca vai pro cliente (21/10: um cliente recebeu "<invoke name=..." e o JSON cru).
export const LIXO_TECNICO = /<\\/?(invoke|parameter|function_calls|antml)|\`\`\`|"partes"\\s*:|^\\s*[{[]/i;

// Quebra de linha crua DENTRO de uma frase do JSON ("Desculpa!<enter>Aqui...") e invalida no JSON.parse:
// escapa so o que esta dentro de aspas.
function escaparQuebrasNasFrases(s: string): string {
  let out = '', dentro = false, escape = false;
  for (const ch of s) {
    if (dentro && !escape && (ch === '\\n' || ch === '\\r')) { out += ch === '\\n' ? '\\\\n' : ''; continue; }
    if (ch === '"' && !escape) dentro = !dentro;
    escape = ch === '\\\\' && !escape;
    out += ch;
  }
  return out;
}

function parsearRespostaBot(payload: string): RespostaBotBridge {
  const bruto = String(payload || '').trim();
  if (!bruto) return { partes: [] };
  const limpar = (lista: any[]) => lista.map((p) => String(p || '').trim()).filter((p) => p && !LIXO_TECNICO.test(p)).slice(0, 4);
  const tentar = (s: string): string[] | null => {
    for (const t of [s, escaparQuebrasNasFrases(s)]) {
      try { const p = JSON.parse(t); if (Array.isArray(p?.partes)) return limpar(p.partes); } catch {}
    }
    return null;
  };
  // A IA as vezes escreve algo antes/depois do JSON (cerca \`\`\`json, "<invoke ...>"): acha o {"partes": ...} onde estiver.
  const ini = bruto.search(/\\{\\s*"partes"\\s*:/);
  if (ini >= 0) {
    const resto = bruto.slice(ini);
    for (let fim = resto.lastIndexOf('}'); fim > 0; fim = resto.lastIndexOf('}', fim - 1)) {
      const r = tentar(resto.slice(0, fim + 1));
      if (r) return { partes: r };
    }
  }
  const semCerca = bruto.replace(/^\`\`\`(?:json)?\\s*/i, '').replace(/\\s*\`\`\`$/, '').trim();
  const r = tentar(semCerca);
  if (r) return { partes: r };
  // Texto puro (sem JSON) so passa se nao tiver cara de codigo.
  if (LIXO_TECNICO.test(semCerca) || /[{}]/.test(semCerca)) {
    console.error('[BotService] resposta da IA ilegivel — nada enviado:', bruto.slice(0, 300));
    return { partes: [] };
  }
  return { partes: [semCerca.slice(0, 3500)] };
}`],
], 'escaparQuebrasNasFrases');

patch('src/services/botLojas.ts', [
  [`  REMARKETING?: RemarketingLoja | undefined;
}`, `  REMARKETING?: RemarketingLoja | undefined;
  // Conversa que um atendente (pessoa) atendeu nas ultimas N horas e dele: o robo nao entra. 0 = desligado.
  HUMANO_ASSUMIU_HORAS?: number | undefined;
}`],
  [`    CHAVES_ATENDENTE: Array.isArray(daLoja?.CHAVES_ATENDENTE) ? daLoja.CHAVES_ATENDENTE.map(String) : undefined,`,
   `    CHAVES_ATENDENTE: Array.isArray(daLoja?.CHAVES_ATENDENTE) ? daLoja.CHAVES_ATENDENTE.map(String) : undefined,
    HUMANO_ASSUMIU_HORAS: num(daLoja?.HUMANO_ASSUMIU_HORAS),`],
  [`  { campo: 'PAUSA_FORA_DA_LISTA_MIN', rotulo: 'Pneu fora da tabela: robô fica quieto por (minutos)', tipo: 'numero' },`,
   `  { campo: 'PAUSA_FORA_DA_LISTA_MIN', rotulo: 'Pneu fora da tabela: robô fica quieto por (minutos)', tipo: 'numero' },
  { campo: 'HUMANO_ASSUMIU_HORAS', rotulo: 'Atendente já atendeu o cliente: robô não entra na conversa por (horas; padrão 12, 0 = desliga)', tipo: 'numero' },`],
], 'HUMANO_ASSUMIU_HORAS');

patch('src/workers/botAtendimentoService.ts', [
  [`async function enviarEmBolhas(params: AgendarBotParams, texto: string): Promise<boolean> {
  for (const bolha of quebrarEmBolhas(texto)) {`,
`// Trava final (21/10): nada com cara de codigo/JSON vai pro cliente, venha de onde vier.
const BOLHA_DE_CODIGO = /<\\/?(invoke|parameter|function_calls|antml)|\`\`\`|"partes"\\s*:/i;

async function enviarEmBolhas(params: AgendarBotParams, texto: string): Promise<boolean> {
  if (BOLHA_DE_CODIGO.test(texto)) {
    console.error(\`[Bot IA] \${params.chatJid}: resposta com cara de codigo BLOQUEADA (nao enviada): \${texto.slice(0, 160)}\`);
    return false;
  }
  for (const bolha of quebrarEmBolhas(texto)) {`],
  [`    for (let i = historico.length - 1; i >= 0; i--) { if ((historico[i] as any).enviadoPorId === 'meta_ai') historico.splice(i, 1); }\n`,
`    for (let i = historico.length - 1; i >= 0; i--) { if ((historico[i] as any).enviadoPorId === 'meta_ai') historico.splice(i, 1); }

    // 21/10 (caso Maurício): conversa que um ATENDENTE (pessoa) atendeu nas ultimas N horas e dele — o robo nao entra.
    // O robo nao ve o orcamento em foto nem os audios da atendente: entrando, cotava outra marca e contradizia o que
    // ela ofereceu. Nao contam: mensagem do robo, saudacao automatica do WhatsApp Business e o 🙋🏼‍♀️ de remarketing.
    {
      const horas = cfgLoja.HUMANO_ASSUMIU_HORAS ?? 12;
      if (horas > 0) {
        const desde = Date.now() - horas * 3600_000;
        const humano = [...historico].reverse().find((m: any) => m.fromMe
          && m.enviadoPorId !== 'bot' && m.enviadoPorId !== 'meta_ai'
          && new Date(m.timestamp).getTime() >= desde
          && !MSG_AUTOMATICA_DA_LOJA.test(String(m.texto || '')));
        if (humano) {
          console.log(\`[Bot IA] \${params.chatJid}: atendente atendeu \${new Date((humano as any).timestamp).toISOString()} (< \${horas}h) — conversa e dela, robo nao entra.\`);
          return;
        }
      }
    }
`],
  [`const REGEX_CANDIDATO =`,
`// Mensagens que a loja manda sem ser uma pessoa atendendo: saudacao automatica do WhatsApp Business e o 🙋🏼‍♀️.
const MSG_AUTOMATICA_DA_LOJA = /Seja bem-vindo\\(a\\)|^\\s*🙋🏼‍♀️\\s*$/;

const REGEX_CANDIDATO =`],
], 'MSG_AUTOMATICA_DA_LOJA');
