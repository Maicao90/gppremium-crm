// 22/10: grava os textos da GP no jeito da Josy (situacoes que o fluxo fixo ja cobre). Valida antes de gravar.
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { validarTextoFluxo } from '/root/whatsapp-crm/backend/src/data/fluxoCatalogo';

const LOJA = 'loja:72213a6c-31c5-410d-a6b4-504dfd223e2f:';
const textos: Record<string, string[]> = JSON.parse(fs.readFileSync('/root/textos-gp-josy.json', 'utf8'));

(async () => {
  for (const [k, v] of Object.entries(textos)) {
    const p = validarTextoFluxo(k, v);
    if (p.length) { console.log('PROBLEMA', k, p); process.exit(1); }
  }
  const prisma = new PrismaClient();
  const antes = await (prisma as any).fluxoResposta.findMany({ where: { chave: { startsWith: LOJA } } });
  fs.writeFileSync(`/root/fluxoresposta-gp-antes-josy-${Date.now()}.json`, JSON.stringify(antes, null, 1));
  for (const [k, v] of Object.entries(textos)) {
    await (prisma as any).fluxoResposta.upsert({
      where: { chave: LOJA + k },
      create: { chave: LOJA + k, partes: JSON.stringify(v), atualizadoPor: 'Josy (aprovado pelo dono 22/10)' },
      update: { partes: JSON.stringify(v), atualizadoPor: 'Josy (aprovado pelo dono 22/10)' },
    });
    console.log('ok', k);
  }
  const depois = await (prisma as any).fluxoResposta.findMany({ where: { chave: { startsWith: LOJA } }, orderBy: { chave: 'asc' } });
  for (const d of depois) console.log('-', d.chave.replace(LOJA, ''), String(d.partes).slice(0, 90));
  await prisma.$disconnect();
})();
