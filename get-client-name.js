const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.client.findUnique({ where: { id: 17 } });
  console.log(c.name);
}

main().finally(() => prisma.$disconnect());
