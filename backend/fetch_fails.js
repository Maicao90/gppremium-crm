"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
//# sourceMappingURL=fetch_fails.js.map