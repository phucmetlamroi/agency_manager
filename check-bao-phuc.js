const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: { contains: 'Bao Phuc' } }, { nickname: { contains: 'Bao Phuc' } }] }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log(`Found user: ${user.username} (ID: ${user.id})`);

  const errorLogs = await prisma.errorLog.findMany({
    where: { userId: user.id },
    include: {
      task: true,
      error: true
    }
  });

  console.log(`Found ${errorLogs.length} error logs for user.`);

  const orphanedLogs = [];
  for (const log of errorLogs) {
    if (!log.task) {
      orphanedLogs.push(log);
    }
  }

  console.log(`Orphaned logs (no task): ${orphanedLogs.length}`);

  if (orphanedLogs.length > 0) {
    console.log('Sample orphaned log IDs:', orphanedLogs.slice(0, 5).map(l => l.id));
  }
  
  // Also check if there are tasks for him
  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id }
  });
  console.log(`Active tasks for user: ${tasks.length}`);
}

main().finally(() => prisma.$disconnect());
