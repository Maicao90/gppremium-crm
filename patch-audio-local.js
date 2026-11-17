// 21/10: robo ouve o audio do cliente (whisper.cpp local). O texto entra no lugar do audio na conversa
// (o fluxo le como se o cliente tivesse escrito) e a OpenAI nao e mais usada pra transcrever.
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

fs.copyFileSync(base + '/../transcricaoLocal.ts', base + '/src/services/transcricaoLocal.ts');
console.log('src/services/transcricaoLocal.ts ok');

patch('src/workers/botAtendimentoService.ts', [
  ["import { configBotDaLoja, antesDoInicioDoRobo, caminhoFotoFachada } from '../services/botLojas';",
   "import { configBotDaLoja, antesDoInicioDoRobo, caminhoFotoFachada } from '../services/botLojas';\nimport { transcreverAudioLocal, transcricaoSalva, transcricaoLocalDisponivel } from '../services/transcricaoLocal';"],
  ["function midiaDaUltima(mensagem: any): { imagem?: any; audio?: any } {",
`function arquivoDaMidia(mensagem: any): string | null {
  if (!mensagem?.midiaUrl) return null;
  const raiz = path.resolve(__dirname, '../../public');
  const arquivo = path.resolve(raiz, String(mensagem.midiaUrl).replace(/^[/\\\\]+/, ''));
  return arquivo.startsWith(raiz + path.sep) && fs.existsSync(arquivo) ? arquivo : null;
}

// Audio do cliente vira texto (21/10, whisper local — sem OpenAI). Os da rodada atual (depois da ultima
// mensagem da loja) sao transcritos agora; os mais antigos so usam o texto se ja foi feito antes.
// O texto entra no lugar do audio (so na memoria, o banco nao muda) e a mensagem fica marcada __transcrito.
async function transcreverAudiosDoCliente(historico: any[], chatJid: string): Promise<void> {
  if (!transcricaoLocalDisponivel()) return;
  let ini = historico.length;
  while (ini > 0 && !historico[ini - 1].fromMe) ini--;
  for (let i = 0; i < historico.length; i++) {
    const m = historico[i];
    if (m.fromMe || m.tipo !== 'audio' || String(m.texto || '').trim()) continue;
    const arquivo = arquivoDaMidia(m);
    if (!arquivo) continue;
    const texto = i >= ini ? await transcreverAudioLocal(arquivo) : transcricaoSalva(arquivo);
    if (texto) { m.texto = texto; m.__transcrito = true; }
    else if (i >= ini) console.log(\`[Bot IA] \${chatJid}: audio do cliente sem transcricao — o robo pede pra escrever.\`);
  }
}

function midiaDaUltima(mensagem: any): { imagem?: any; audio?: any } {`],
  ["    const historico = await prisma.mensagem.findMany({\n      where: { usuarioId: params.usuarioId, chatJid: params.chatJid },\n      orderBy: { timestamp: 'desc' },\n      take: 40,\n    });\n    historico.reverse();\n",
   "    const historico = await prisma.mensagem.findMany({\n      where: { usuarioId: params.usuarioId, chatJid: params.chatJid },\n      orderBy: { timestamp: 'desc' },\n      take: 40,\n    });\n    historico.reverse();\n    await transcreverAudiosDoCliente(historico, params.chatJid);\n    if (versoes.get(key) !== versao) return; // chegou mensagem nova enquanto transcrevia: a rodada nova responde\n"],
  ["    const midia = midiaDaUltima(ultima);\n",
   "    // Audio ja transcrito vai como TEXTO (acima); so foto (ou audio que nao deu pra transcrever) vai como midia.\n    const midia = (ultima as any)?.__transcrito ? {} : midiaDaUltima(ultima);\n"],
], 'transcreverAudiosDoCliente');

patch('src/bot-service/server.ts', [
  ["  const chaveWhisper = process.env.OPENAI_API_KEY?.trim();",
   "  // 21/10: o audio ja chega transcrito pelo whisper local (whatsapp-crm). OpenAI so se ligada de proposito.\n  const chaveWhisper = process.env.TRANSCRICAO_OPENAI === '1' ? process.env.OPENAI_API_KEY?.trim() : undefined;"],
], 'TRANSCRICAO_OPENAI');
