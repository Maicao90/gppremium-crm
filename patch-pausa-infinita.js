// 21/10: pausa ∞ do painel tem que durar ate reativar. As pausas automaticas (atendente respondeu,
// fora da lista, curriculo, anti-loop) gravavam um pausadoAte NOVO e mais curto por cima da ∞.
// Agora pausa automatica nunca encurta uma pausa que ja termina depois. Painel (1h/4h/reativar) segue mandando.
// E a saudacao de silencio (recepcao) passa a respeitar a lista "nao atender".
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
  ["export async function pausarConversaBotIA(",
`// Pausa automatica nunca encurta a que ja esta valendo (21/10: o ∞ do painel era sobrescrito pelos
// 10 min de "atendente respondeu"). Devolve o pausadoAte/motivo que devem ficar gravados.
async function pausaSemEncurtar(usuarioId: string, chatJid: string, minutos: number, motivo: string): Promise<{ pausadoAte: Date; motivoPausa: string }> {
  const nova = new Date(Date.now() + minutos * 60 * 1000);
  const atual = await prisma.botConversa.findUnique({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    select: { pausadoAte: true, motivoPausa: true },
  }).catch(() => null);
  if (atual?.pausadoAte && atual.pausadoAte > nova) return { pausadoAte: atual.pausadoAte, motivoPausa: atual.motivoPausa || motivo };
  return { pausadoAte: nova, motivoPausa: motivo };
}

export async function pausarConversaBotIA(`],
  [`  const duracao = Math.max(5, minutos ?? usuario?.botIaPausaManualMin ?? 120);
  await prisma.botConversa.upsert({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    create: { usuarioId, chatJid, pausadoAte: new Date(Date.now() + duracao * 60 * 1000), motivoPausa: motivo },
    update: { pausadoAte: new Date(Date.now() + duracao * 60 * 1000), motivoPausa: motivo },
  });`,
`  const duracao = Math.max(5, minutos ?? usuario?.botIaPausaManualMin ?? 120);
  const pausa = await pausaSemEncurtar(usuarioId, chatJid, duracao, motivo);
  await prisma.botConversa.upsert({
    where: { usuarioId_chatJid: { usuarioId, chatJid } },
    create: { usuarioId, chatJid, ...pausa },
    update: pausa,
  });`],
  [`      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, pausadoAte: new Date(Date.now() + 12 * 60 * 60 * 1000), motivoPausa: ritmo.motivo || 'anti_loop' },
        update: { pausadoAte: new Date(Date.now() + 12 * 60 * 60 * 1000), motivoPausa: ritmo.motivo || 'anti_loop' },
      }).catch(() => {});`,
`      const pausaLoop = await pausaSemEncurtar(params.usuarioId, params.chatJid, 12 * 60, ritmo.motivo || 'anti_loop');
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ...pausaLoop },
        update: pausaLoop,
      }).catch(() => {});`],
  [`        await prisma.botConversa.upsert({
          where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
          create: { usuarioId: params.usuarioId, chatJid: params.chatJid, pausadoAte: new Date(Date.now() + 7 * 86400_000), motivoPausa: 'curriculo' },
          update: { pausadoAte: new Date(Date.now() + 7 * 86400_000), motivoPausa: 'curriculo' },
        }).catch(() => {});`,
`        const pausaCv = await pausaSemEncurtar(params.usuarioId, params.chatJid, 7 * 24 * 60, 'curriculo');
        await prisma.botConversa.upsert({
          where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
          create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ...pausaCv },
          update: pausaCv,
        }).catch(() => {});`],
  [`      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), pausadoAte: new Date(Date.now() + pausaMin * 60000), motivoPausa: 'fora_da_lista' },
        update: { ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), pausadoAte: new Date(Date.now() + pausaMin * 60000), motivoPausa: 'fora_da_lista' },`,
`      const pausaFora = await pausaSemEncurtar(params.usuarioId, params.chatJid, pausaMin, 'fora_da_lista');
      await prisma.botConversa.upsert({
        where: { usuarioId_chatJid: { usuarioId: params.usuarioId, chatJid: params.chatJid } },
        create: { usuarioId: params.usuarioId, chatJid: params.chatJid, ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), ...pausaFora },
        update: { ultimoInboundWaId: params.waId, ultimaRespostaEm: new Date(), ...pausaFora },`],
], 'pausaSemEncurtar');

patch('src/workers/whatsappService.ts', [
  [`        return;
      }
      // Considera TODAS as formas que o contato pode ter sido salvo (número real OU @lid cru)`,
`        return;
      }
      // Lista "nao atender" (data/bot-nao-atender.json) vale tambem pra saudacao automatica (21/10, Getulio).
      if (await naoAtender(usuarioId, remoteJid)) return;
      // Considera TODAS as formas que o contato pode ter sido salvo (número real OU @lid cru)`],
], 'vale tambem pra saudacao automatica');
