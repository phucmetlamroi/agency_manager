const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { username: 'Bao Phuc' }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  const logs = await prisma.errorLog.findMany({
    where: { userId: user.id },
    include: {
      task: true,
      error: true
    }
  });

  console.log(`User: ${user.username} (${user.id})`);
  console.log(`Log Count: ${logs.length}`);
  
  logs.forEach(l => {
    console.log(`- Log ID: ${l.id}`);
    console.log(`  Code: ${l.error?.code}`);
    console.log(`  Penalty: ${l.calculatedScore}`);
    console.log(`  Task ID: ${l.taskId}`);
    console.log(`  Task Exists: ${!!l.task}`);
    if (l.task) {
        console.log(`  Task Title: ${l.task.title}`);
        console.log(`  Task Status: ${l.task.status}`);
    }
  });
  
  const totalPenalty = logs.reduce((sum, l) => sum + l.calculatedScore, 0);
  console.log(`Total Penalty: ${totalPenalty}`);
}

main().finally(() => prisma.$disconnect());
