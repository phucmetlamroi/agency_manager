const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.task.deleteMany({
    where: {
      OR: [
        { title: 'ádsdf' },
        { profileId: null, status: 'Hoàn tất' }
      ]
    }
  });
  console.log('Cleanup result:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
