import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const helenAgendamentos = await prisma.agendamento.findMany({
    where: {
      OR: [
        { cliente: { contains: 'helen' } },
        { cliente: { contains: 'Helen' } },
        { numero: { contains: '91884391' } }
      ]
    }
  });

  console.log("=== AGENDAMENTOS DA HELEN ===");
  console.log(JSON.stringify(helenAgendamentos, null, 2));

  const helenContatos = await prisma.contato.findMany({
    where: {
      OR: [
        { nome: { contains: 'helen' } },
        { nome: { contains: 'Helen' } },
        { numero: { contains: '91884391' } }
      ]
    }
  });

  console.log("=== CONTATOS DA HELEN ===");
  console.log(JSON.stringify(helenContatos, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
