const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:Adenha90%40%40%40@db.dvquytxugsjfkahklhkr.supabase.co:5432/postgres' } }
});

async function check() {
  try {
    const list = await prisma.usuario.findMany();
    console.log('USUARIOS_BANCO:', JSON.stringify(list, null, 2));
  } catch(e) {
    console.error('ERRO_BUSCA:', e);
  } finally {
    await prisma.$disconnect();
  }
}
check();
