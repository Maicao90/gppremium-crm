// SO LEITURA: reaplica a decisao nova (Ajuste 1) nas conversas REAIS que pausaram por fora_da_lista.
// Para cada mensagem do cliente depois da pausa: o que o robo faria com a regra nova naquele instante.
import { decidirRetomadaForaDaLista, inicioDaPausaForaDaLista } from '/root/ant-lab/src/data/retomadaForaDaLista';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const bc = await prisma.botConversa.findMany({ where: { motivoPausa: 'fora_da_lista' }, orderBy: { atualizadoEm: 'desc' }, take: 30, select: { usuarioId: true, chatJid: true, pausadoAte: true, motivoPausa: true } });
  for (const c of bc) {
    const inicio = inicioDaPausaForaDaLista(c.pausadoAte, 12 * 60);
    const msgs = await prisma.mensagem.findMany({ where: { usuarioId: c.usuarioId, chatJid: c.chatJid, timestamp: { gte: inicio, lte: c.pausadoAte } }, orderBy: { timestamp: 'asc' }, select: { fromMe: true, enviadoPorId: true, texto: true, tipo: true, timestamp: true } });
    const linhas: string[] = [];
    msgs.forEach((m: any, i: number) => {
      if (m.fromMe) return;
      const ate = msgs.slice(0, i + 1);
      const d = decidirRetomadaForaDaLista({ pausadoAte: c.pausadoAte, motivoPausa: c.motivoPausa, agora: new Date(new Date(m.timestamp).getTime() + 20000), mensagensDesdeAPausa: ate });
      linhas.push(`  ${new Date(m.timestamp).toISOString()} CLIENTE "${String(m.texto || '[' + m.tipo + ']').slice(0, 50)}" -> ${d.liberar ? 'ROBO VOLTA (' + d.medida + ')' : 'continua pausado (' + d.motivo + ')'}`);
    });
    if (!linhas.length) continue;
    console.log(`== ${c.chatJid} (pausa ${inicio.toISOString()} -> ${c.pausadoAte.toISOString()})`);
    console.log(linhas.slice(0, 6).join('\n'));
  }
  await prisma.$disconnect();
})();
