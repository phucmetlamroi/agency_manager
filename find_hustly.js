
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findHustly() {
  const profile = await prisma.profile.findFirst({
      where: { name: { contains: 'Hustly', mode: 'insensitive' } }
  });
  console.log("Hustly Profile:", profile);
}

findHustly().catch(console.error).finally(() => prisma.$disconnect());
