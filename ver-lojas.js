// Só leitura: lista lojas e as contas de mecânico (operador + garantia50k, sem at-*).
const { PrismaClient } = require('/root/whatsapp-crm/backend/node_modules/@prisma/client');
const p = new PrismaClient();
(async () => {
  const lojas = await p.loja.findMany({ orderBy: { store_name: 'asc' } });
  console.log('LOJAS');
  for (const l of lojas) console.log(JSON.stringify({ id: l.id, nome: l.store_name, cidade: l.cidade || l.city, cred: l.credenciadaGarantia ?? l.garantiaCredenciada }));
  const us = await p.usuario.findMany();
  console.log('MECANICOS/OPERADORES COM garantia50k');
  for (const u of us) {
    let m = []; try { m = JSON.parse(u.modulosPermitidos || '[]'); } catch {}
    if (!m.includes('garantia50k')) continue;
    console.log(JSON.stringify({ id: u.id, nome: u.nome, email: u.email, role: u.role, lojaId: u.lojaId, modulos: m, ativo: u.ativo }));
  }
  console.log('CAMPOS Usuario:', Object.keys(us[0] || {}).join(','));
  console.log('CAMPOS Loja:', Object.keys(lojas[0] || {}).join(','));
  await p.$disconnect();
})();
