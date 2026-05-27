import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fails = await prisma.agendamento.findMany({
    orderBy: { enviarEm: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(fails, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
