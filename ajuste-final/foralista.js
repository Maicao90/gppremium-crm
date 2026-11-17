// SO LEITURA: conversas que ja pausaram por fora_da_lista e como ficam as mensagens depois da pausa.
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const bc = await prisma.botConversa.findMany({ where: { motivoPausa: 'fora_da_lista' }, orderBy: { atualizadoEm: 'desc' }, take: 8, select: { usuarioId: true, chatJid: true, pausadoAte: true, motivoPausa: true, ultimaRespostaEm: true } });
  for (const c of bc) {
    const inicio = new Date(c.pausadoAte.getTime() - 12 * 60 * 60000);
    console.log(`\n== ${c.chatJid} pausadoAte=${c.pausadoAte.toISOString()} inicio~${inicio.toISOString()} ultimaRespostaEm=${c.ultimaRespostaEm && c.ultimaRespostaEm.toISOString()}`);
    const msgs = await prisma.mensagem.findMany({ where: { usuarioId: c.usuarioId, chatJid: c.chatJid, timestamp: { gte: new Date(inicio.getTime() - 5 * 60000) } }, orderBy: { timestamp: 'asc' }, take: 14, select: { fromMe: true, enviadoPorId: true, tipo: true, texto: true, timestamp: true } });
    for (const m of msgs) console.log(`  ${m.timestamp.toISOString()} ${m.fromMe ? 'LOJA(' + m.enviadoPorId + ')' : 'CLIENTE'} [${m.tipo}] ${String(m.texto || '').slice(0, 90).replace(/\n/g, ' ')}`);
  }
  await prisma.$disconnect();
})();
