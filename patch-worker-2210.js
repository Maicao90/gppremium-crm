// 22/10 (whatsapp-crm) — revisao das conversas:
// 1) ritmo de gente: o robo esperava 5-8 s pra responder e "digitava" rapido demais; agora 15-30 s e digita mais devagar;
// 2) pausa no painel vale na hora: cancela a resposta que estava pra sair e confere a pausa antes de CADA bolha
//    (caso 22/10 11:02:43: pausou e 3 s depois saiu o texto do alinhamento);
// 3) curriculo: "vaga que esta aberta ai" passava (so pegava "vaga de emprego");
// 4) audio do cliente: o whisper recebe o vocabulario da loja (medidas faladas viram 225/65/16, nao "2, 2, 5, 6, 5, 16").
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

patch('src/workers/botAtendimentoService.ts', [
  [`  const espera = esperaMaiorAnuncioSemMedida
    ? 12000 + Math.floor(Math.random() * 4000)
    : 5500 + Math.floor(Math.random() * 3000);`,
   `  // 22/10 (dono: "esta respondendo muito rapido"): ritmo de gente — 15 a 30 s antes de responder.
  const espera = esperaMaiorAnuncioSemMedida
    ? 20000 + Math.floor(Math.random() * 10000)
    : 15000 + Math.floor(Math.random() * 15000);`],
  [`function tempoDigitacao(texto: string): number {
  const variacao = Math.floor(Math.random() * 900);
  return Math.min(6000, Math.max(1200, 700 + texto.length * 28 + variacao));
}`,
   `function tempoDigitacao(texto: string): number {
  // 22/10: digitava rapido demais. ~45 ms por letra, entre 2,5 e 9 s por bolha.
  const variacao = Math.floor(Math.random() * 1500);
  return Math.min(9000, Math.max(2500, 1000 + texto.length * 45 + variacao));
}

// Pausa dada no painel: cancela a resposta que estava agendada/pronta pra sair nesta conversa (22/10).
export function cancelarConversaBotIA(usuarioId: string, chatJid: string) {
  const key = chave(usuarioId, chatJid);
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
  versoes.set(key, (versoes.get(key) || 0) + 1);
}`],
  [`  for (const bolha of quebrarEmBolhas(texto)) {
    const ok = await params.enviarParte(bolha, tempoDigitacao(bolha));`,
   `  for (const bolha of quebrarEmBolhas(texto)) {
    // A pausa pode ter sido dada no meio da resposta (painel ou atendente): confere antes de CADA bolha (22/10).
    if (!(await conversaLiberada(params.usuarioId, params.chatJid))) {
      console.log(\`[Bot IA] \${params.chatJid}: conversa pausada no meio da resposta — parei de mandar.\`);
      return false;
    }
    const ok = await params.enviarParte(bolha, tempoDigitacao(bolha));`],
  [`const REGEX_CANDIDATO = /(curr[ií]cul(o|um)|\\bcv\\b|contratando|`,
   `const REGEX_CANDIDATO = /(curr[ií]cul(o|um)|\\bcv\\b|contratando|\\bvagas?\\s+(que|aberta|abertas|dispon[ií]ve(l|is)|na loja|a[ií])\\b|`],
], 'export function cancelarConversaBotIA');

patch('src/routes/botPneus.ts', [
  [`import { lerBotPneusConfig, salvarBotPneusConfig } from '../services/botPneusConfig';`,
   `import { lerBotPneusConfig, salvarBotPneusConfig } from '../services/botPneusConfig';
import { cancelarConversaBotIA } from '../workers/botAtendimentoService';`],
  [`      else if (modo === 'reativar') pausadoAte = null;
`,
   `      else if (modo === 'reativar') pausadoAte = null;
      // Pausou: a resposta que o robo estava pra mandar nesta conversa nao sai mais (22/10).
      if (pausadoAte) cancelarConversaBotIA(alvo.usuarioId, alvo.chatJid);
`],
], 'cancelarConversaBotIA(alvo.usuarioId');

patch('src/services/transcricaoLocal.ts', [
  [`const LIMITE_MS = 120_000;`,
   `const LIMITE_MS = 120_000;
// Vocabulario da loja pro whisper (22/10): medida falada sai "225/65/16" e nao "2, 2, 5, 6, 5, 16".
const VOCABULARIO = 'Atendimento de loja de pneus no WhatsApp. Medidas como 175/70 aro 14, 185/65/15, 195/55/15, 205/55/16, 265/60/18. Pneu GP Premium, remold, alinhamento, balanceamento, à vista, Pix, cartão, parcelar em 10 vezes, Luziânia.';`],
  [`'-ac', String(ctx), '-f', wav]`, `'-ac', String(ctx), '--prompt', VOCABULARIO, '-f', wav]`],
], 'VOCABULARIO');
