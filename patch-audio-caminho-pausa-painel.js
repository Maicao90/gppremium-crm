// 21/10: (1) os audios da Josy nunca sairam: o caminho "/midias/bot-audios/x.ogg" era tratado como caminho
// ABSOLUTO do servidor ("arquivo nao encontrado") e o robo caia no texto. Agora "/midias/..." e relativo a public/.
// (2) mandar mensagem/midia pelo painel do robo trocava a pausa ∞ por 1h — agora nunca encurta uma pausa maior.
const fs = require('fs');
const base = process.argv[2];
function patch(rel, trocas, marca) {
  const f = base + '/' + rel;
  let s = fs.readFileSync(f, 'utf8');
  const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
  if (s.includes(marca)) { console.log(rel, 'ja aplicado'); return; }
  for (const [a, b, n] of trocas) {
    const c = s.split(a).length - 1;
    if (c !== (n || 1)) { console.error(rel, 'ocorrencias', c, JSON.stringify(a.slice(0, 90))); process.exit(1); }
    s = s.split(a).join(b);
  }
  if (crlf) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(f, s); console.log(rel, 'ok');
}

patch('src/workers/whatsappService.ts', [
  [`  const absoluto = path.isAbsolute(caminhoOriginal)
    ? path.resolve(caminhoOriginal)
    : path.resolve(publicRoot, caminhoOriginal.replace(/^[/\\\\]+/, ''));
  if (!fs.existsSync(absoluto)) throw new Error(\`arquivo nao encontrado: \${caminhoOriginal}\`);`,
`  // "/midias/bot-audios/x.ogg" e caminho do SITE (dentro de public/), nao da raiz do servidor (21/10: por isso os
  // audios da Josy nunca sairam). Caminho absoluto de verdade so vale se o arquivo existir la.
  const dentroDoPublic = path.resolve(publicRoot, caminhoOriginal.replace(/^[/\\\\]+/, ''));
  const absoluto = path.isAbsolute(caminhoOriginal) && fs.existsSync(caminhoOriginal) ? path.resolve(caminhoOriginal) : dentroDoPublic;
  if (absoluto === dentroDoPublic && !dentroDoPublic.startsWith(publicRoot + path.sep)) throw new Error(\`caminho fora de public: \${caminhoOriginal}\`);
  if (!fs.existsSync(absoluto)) throw new Error(\`arquivo nao encontrado: \${caminhoOriginal}\`);`],
], 'caminho do SITE (dentro de public/)');

patch('src/routes/botPneus.ts', [
  [`        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: {
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },`,
`        create: {
          usuarioId: alvo.usuarioId,
          chatJid: alvo.chatJid,
          pausadoAte: new Date(Date.now() + 60 * 60 * 1000),
          motivoPausa: 'atendimento_manual',
        },
        update: await pausaDoPainelSemEncurtar(alvo.usuarioId, alvo.chatJid),`, 2],
  [`const router = Router();`,
`const router = Router();

// Mandar mensagem/midia pelo painel pausa o robo 1h — mas nunca encurta uma pausa maior (o ∞ fica ∞). 21/10.
async function pausaDoPainelSemEncurtar(usuarioId: string, chatJid: string): Promise<{ pausadoAte: Date; motivoPausa: string }> {
  const umaHora = new Date(Date.now() + 60 * 60 * 1000);
  const atual = await prisma.botConversa.findUnique({ where: { usuarioId_chatJid: { usuarioId, chatJid } }, select: { pausadoAte: true } }).catch(() => null);
  return { pausadoAte: atual?.pausadoAte && atual.pausadoAte > umaHora ? atual.pausadoAte : umaHora, motivoPausa: 'atendimento_manual' };
}`],
], 'pausaDoPainelSemEncurtar');
