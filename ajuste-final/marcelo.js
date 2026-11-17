// SO LEITURA: historico real do Marcelo Santos (556199788540) em 23/10.
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const msgs = await prisma.mensagem.findMany({
    where: { OR: [{ chatJid: { contains: '556199788540' } }, { numeroReal: { contains: '556199788540' } }] },
    orderBy: { timestamp: 'asc' },
    select: { usuarioId: true, chatJid: true, fromMe: true, texto: true, tipo: true, timestamp: true, enviadoPorId: true },
  });
  for (const m of msgs) console.log(JSON.stringify({ ts: m.timestamp, chat: m.chatJid, u: m.usuarioId.slice(0, 8), me: m.fromMe, por: m.enviadoPorId, tipo: m.tipo, t: m.texto }));
  const jids = [...new Set(msgs.map((m) => m.chatJid))];
  const bc = await prisma.botConversa.findMany({ where: { chatJid: { in: jids } }, select: { chatJid: true, estadoPreco: true, dadosPreco: true, pausadoAte: true, motivoPausa: true } });
  console.log('BOTCONVERSA', JSON.stringify(bc));
  await prisma.$disconnect();
})();
