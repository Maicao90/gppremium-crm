// 21/10 (pedido do dono): mensagem comprida do robo vai QUEBRADA em bolhas curtas, como uma pessoa digita no
// WhatsApp — cada bolha com o proprio "digitando...". So quebra entre frases (nunca no meio de preco/medida).
const fs = require('fs');
const f = process.argv[2] + '/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('function quebrarEmBolhas')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };

rep("function tempoDigitacao(texto: string): number {",
`// Bolha "natural": ate ~170 caracteres. Texto maior quebra em fim de frase (". ", "! ", "? " seguido de letra
// maiuscula/emoji/asterisco) ou em linha em branco, juntando frases curtas na mesma bolha. Lista (linhas com
// medida/preco) fica inteira. No maximo 4 bolhas por parte.
export function quebrarEmBolhas(texto: string): string[] {
  const t = String(texto || '').trim();
  if (t.length <= 170) return t ? [t] : [];
  if (/\\n\\s*[-•\\d*]/.test(t) && !/\\n\\n/.test(t)) return [t];
  const frases = t
    .split(/\\n{2,}/)
    .flatMap((bloco) => bloco.split(/(?<=[.!?…])\\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ*🔥😊👍🙋])/u))
    .map((x) => x.trim())
    .filter(Boolean);
  const bolhas: string[] = [];
  let atual = '';
  for (const fr of frases) {
    if (atual && (atual.length + 1 + fr.length) > 170) { bolhas.push(atual); atual = fr; }
    else atual = atual ? \`\${atual} \${fr}\` : fr;
  }
  if (atual) bolhas.push(atual);
  if (bolhas.length > 4) return [...bolhas.slice(0, 3), bolhas.slice(3).join(' ')];
  return bolhas;
}

async function enviarEmBolhas(params: AgendarBotParams, texto: string): Promise<boolean> {
  for (const bolha of quebrarEmBolhas(texto)) {
    const ok = await params.enviarParte(bolha, tempoDigitacao(bolha));
    if (!ok) return false;
  }
  return true;
}

function tempoDigitacao(texto: string): number {`);
rep("        const enviada = await params.enviarParte(textoLimpo.slice(0, 3500), tempoDigitacao(textoLimpo));",
    "        const enviada = await enviarEmBolhas(params, textoLimpo.slice(0, 3500));");
rep(`        if (!textoLimpo) continue;
        const enviada = await params.enviarParte(textoLimpo, tempoDigitacao(textoLimpo));`,
    `        if (!textoLimpo) continue;
        const enviada = await enviarEmBolhas(params, textoLimpo);`);
rep(`      if (textoLimpo && !usarTextoComoLegenda) {
        const enviada = await params.enviarParte(textoLimpo, tempoDigitacao(textoLimpo));`,
    `      if (textoLimpo && !usarTextoComoLegenda) {
        const enviada = await enviarEmBolhas(params, textoLimpo);`);
fs.writeFileSync(f, s); console.log('ok');
