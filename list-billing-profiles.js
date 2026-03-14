const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const res = await prisma.billingProfile.findMany();
  console.log(JSON.stringify(res, null, 2));
}

main().finally(() => prisma.$disconnect());
