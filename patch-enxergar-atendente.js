// 21/10 (dono: "o robo tem que enxergar o que a atendente faz"): antes de responder, o robo transcreve os AUDIOS
// da atendente (whisper local) e le as FOTOS da conversa (Claude ve imagem) — orcamento da atendente, foto do
// cliente. Tudo entra no historico como texto, entao a IA e o fluxo leem o que ja foi oferecido.
const fs = require('fs');
const base = process.argv[2];
const f = base + '/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('lerImagem(')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); } s = s.replace(a, () => b); };

fs.copyFileSync(base + '/../leituraImagem.ts', base + '/src/services/leituraImagem.ts');
console.log('src/services/leituraImagem.ts ok');

rep("import { transcreverAudioLocal, transcricaoSalva, transcricaoLocalDisponivel } from '../services/transcricaoLocal';",
    "import { transcreverAudioLocal, transcricaoSalva, transcricaoLocalDisponivel } from '../services/transcricaoLocal';\nimport { lerImagem } from '../services/leituraImagem';");

rep(`// Audio do cliente vira texto (21/10, whisper local — sem OpenAI). Os da rodada atual (depois da ultima
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
}`,
`// O robo enxerga a conversa inteira antes de responder (21/10). Tudo vira texto so na memoria (o banco nao muda):
// - audio do CLIENTE da rodada atual: transcrito agora (whisper local); os mais antigos, se ja transcritos antes;
// - audio da ATENDENTE das ultimas 24h (ate 4): transcrito — o robo sabe o que ela falou;
// - FOTO das ultimas 24h (ate 4, de quem for; menos a ultima do cliente, que vai inteira pra IA que ve imagem):
//   lida pela Claude — o orcamento que a atendente mandou, a lateral do pneu do cliente...
// Formato "(…) texto" e nao "[…]": colchete inteiro e tratado como midia sem texto no bot-service.
async function transcreverAudiosDoCliente(historico: any[], chatJid: string): Promise<void> {
  let ini = historico.length;
  while (ini > 0 && !historico[ini - 1].fromMe) ini--;
  const desde = Date.now() - 24 * 3600_000;
  const recente = (m: any) => new Date(m.timestamp).getTime() >= desde;
  const daAtendente = (m: any) => m.fromMe && m.enviadoPorId !== 'bot' && m.enviadoPorId !== 'meta_ai';
  const ultimaCliente = [...historico].reverse().find((m: any) => !m.fromMe);

  if (transcricaoLocalDisponivel()) {
    const audiosAtendente = historico.filter((m: any) => daAtendente(m) && m.tipo === 'audio' && recente(m)).slice(-4);
    for (let i = 0; i < historico.length; i++) {
      const m = historico[i];
      if (m.tipo !== 'audio' || String(m.texto || '').trim()) continue;
      const doCliente = !m.fromMe;
      if (!doCliente && !audiosAtendente.includes(m)) continue;
      const arquivo = arquivoDaMidia(m);
      if (!arquivo) continue;
      const texto = !doCliente || i >= ini ? await transcreverAudioLocal(arquivo) : transcricaoSalva(arquivo);
      if (texto) { m.texto = doCliente ? texto : \`(áudio da atendente) \${texto}\`; m.__transcrito = true; }
      else if (doCliente && i >= ini) console.log(\`[Bot IA] \${chatJid}: audio do cliente sem transcricao — o robo pede pra escrever.\`);
    }
  }

  const fotos = historico.filter((m: any) => m.tipo === 'imagem' && recente(m) && m !== ultimaCliente
    && m.enviadoPorId !== 'bot' && m.enviadoPorId !== 'meta_ai'
    && !String(m.texto || '').startsWith('📢')) // miniatura do anuncio clicado nao e foto de ninguem
    .slice(-4);
  await Promise.all(fotos.map(async (m: any) => {
    const arquivo = arquivoDaMidia(m);
    if (!arquivo) return;
    const leitura = await lerImagem(arquivo, m.fromMe ? 'atendente' : 'cliente');
    if (!leitura) return;
    const legenda = String(m.texto || '').trim();
    m.texto = \`\${legenda ? legenda + '\\n' : ''}(\${m.fromMe ? 'foto que a atendente mandou' : 'foto do cliente'}) \${leitura}\`;
  }));
}`);
fs.writeFileSync(f, s); console.log('worker ok');
