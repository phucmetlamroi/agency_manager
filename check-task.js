const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { title: { contains: 'ádsdf' } },
        { title: { contains: 'adsdf' } }
      ]
    },
    include: {
        profile: true
    }
  });

  console.log('Found Tasks:', JSON.stringify(tasks, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
