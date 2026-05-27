const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:Adenha90%40%40%40@db.dvquytxugsjfkahklhkr.supabase.co:5432/postgres' } }
});

async function run() {
  try {
    const user = await prisma.usuario.upsert({
      where: { email: 'josy@crm.com' },
      update: { senha: 'admin123' },
      create: {
        nome: 'Josy Master',
        email: 'josy@crm.com',
        senha: 'admin123',
        role: 'admin'
      }
    });
    console.log('CONTA_OK:', user.email);
  } catch(e) {
    console.error('ERRO_SEED:', e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
