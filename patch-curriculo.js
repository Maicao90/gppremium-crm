// 21/10 (pedido do dono): CURRICULO / candidato a vaga na GP -> o robo NAO responde (fica pra equipe).
// Deteccao em codigo: "curriculo", "estao contratando", "vaga de emprego/trabalho", "interesse na vaga",
// "fazer parte da empresa", "trabalhar com voces", PDF com "curr" no nome. "tem vaga sabado?" (agenda) NAO conta.
const fs = require('fs');
const f = process.argv[2] + '/src/workers/botAtendimentoService.ts';
let s = fs.readFileSync(f, 'utf8');
if (s.includes('ehCandidatoAVaga')) { console.log('ja aplicado'); process.exit(0); }
const rep = (a, b) => { const c = s.split(a).length - 1; if (c !== 1) { console.error('ocorrencias', c, JSON.stringify(a.slice(0, 80))); process.exit(1); } s = s.replace(a, () => b); };

rep("function tempoDigitacao(texto: string): number {",
`const REGEX_CANDIDATO = /(curr[ií]cul(o|um)|\\bcv\\b|contratando|vaga(s)? de (emprego|trabalho|auxiliar|mec[aâ]nic|vendedor|atendente|borracheir|motorista|estagi)|interesse (na|em uma|numa) vaga|(alguma|tem|h[aá]) vaga (de|pra|para) (emprego|trabalh)|fazer parte d[ae] (sua |vossa )?(empresa|equipe)|trabalhar (com voc[eê]s|a[ií] na|na (empresa|loja) de voc)|\\bemprego\\b)/i;
export function ehCandidatoAVaga(textos: string[]): boolean {
  return textos.some((t) => REGEX_CANDIDATO.test(String(t || '')));
}

function tempoDigitacao(texto: string): number {`);

rep("    const midia = midiaDaUltima(ultima);\n",
`    const midia = midiaDaUltima(ultima);

    // Curriculo / candidato a vaga: o robo nao responde e fica quieto nessa conversa por 7 dias (a equipe cuida).
    {
      let ini = historico.length;
      while (ini > 0 && !(historico[ini - 1] as any).fromMe) ini--;
      const raboCliente = historico.slice(ini).map((m: any) => String(m.texto || ''));
      const pdfCurriculo = historico.slice(ini).some((m: any) => m.tipo === 'documento' && /curr/i.test(String(m.texto || '')));
      if (pdfCurriculo || ehCandidatoAVaga(raboCliente)) {
        await prisma.botConversa.upsert({
          where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
          create: { usuarioId: params.usuarioId, chatJid: params.chatJid, pausadoAte: new Date(Date.now() + 7 * 86400_000), motivoPausa: 'curriculo' },
          update: { pausadoAte: new Date(Date.now() + 7 * 86400_000), motivoPausa: 'curriculo' },
        }).catch(() => {});
        console.log(\`[Bot IA] \${params.chatJid}: curriculo/vaga de emprego — robo nao responde (pausado 7 dias, equipe cuida).\`);
        return;
      }
    }
`);
fs.writeFileSync(f, s); console.log('ok');
