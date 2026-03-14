const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: 'Linh' } },
        { nickname: { contains: 'Linh' } }
      ]
    }
  });

  console.log('Found Users:', JSON.stringify(users, null, 2));

  // Check if there are tasks or rank records for this username
  const tasksCount = await prisma.task.count({
    where: { assigneeId: { in: users.map(u => u.id) } }
  });
  console.log('Tasks for these users:', tasksCount);

  // Check if "Linh" exists in MonthlyRank or similar
  const ranksCount = await prisma.monthlyRank.count({
    where: { userId: { in: users.map(u => u.id) } }
  });
  console.log('MonthlyRanks for these users:', ranksCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
