// SO LEITURA: mensagens, FluxoEvento e BotConversa do cliente 556198132318 (caso 22/10 11:42).
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
const brt = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
(async () => {
  const msgs = await prisma.mensagem.findMany({
    where: { OR: [{ chatJid: { contains: '98132318' } }, { numeroReal: { contains: '98132318' } }] },
    orderBy: { timestamp: 'asc' },
  });
  const jids = [...new Set(msgs.map((m) => m.usuarioId + ' ' + m.chatJid))];
  console.log('chats:', jids);
  for (const m of msgs) console.log(brt(m.timestamp), m.fromMe ? 'LOJA ' + (m.enviadoPorId || '') : 'CLI ', m.tipo, JSON.stringify(m.texto).slice(0, 220));
  const chatJids = [...new Set(msgs.map((m) => m.chatJid))];
  const ev = await prisma.fluxoEvento.findMany({ where: { chatJid: { in: chatJids } }, orderBy: { criadoEm: 'asc' } });
  console.log('\n== FluxoEvento');
  for (const e of ev) console.log(brt(e.criadoEm), '| cli:', e.cliente, '| assuntos', e.assuntos, '| chaves', e.chaves, '| via', e.via, e.motivoLivre || '', '|', e.estadoAntes, '->', e.estadoDepois, '| partes', e.partes);
  const bc = await prisma.botConversa.findMany({ where: { chatJid: { in: chatJids } } });
  console.log('\n== BotConversa', JSON.stringify(bc, null, 1));
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
