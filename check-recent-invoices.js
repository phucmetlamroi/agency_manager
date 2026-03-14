const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { clientId: 21 },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(invoices, null, 2));
}

main().finally(() => prisma.$disconnect());
