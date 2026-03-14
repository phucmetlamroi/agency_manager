const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const t = await prisma.task.findUnique({ where: { id: 'ef94c555-d8a0-4689-bdc4-0db364e8ea05' } });
  console.log(JSON.stringify(t, null, 2));
}

main().finally(() => prisma.$disconnect());
