const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { 
      OR: [
        { username: { contains: 'Phuc' } },
        { username: { contains: 'Phúc' } }
      ]
    }
  });

  for (const user of users) {
    const errorLogs = await prisma.errorLog.findMany({
      where: { userId: user.id }
    });
    console.log(`User: ${user.username} (${user.id}), Error Count: ${errorLogs.length}`);
  }

  // Check for orphaned logs (logs with taskId that doesn't exist anymore)
  // This is hard to do directly with findMany if we don't have task data, but let's try
  const allLogs = await prisma.errorLog.findMany({
    select: { id: true, taskId: true }
  });
  
  const taskIds = allLogs.map(l => l.taskId);
  const existingTasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true }
  });
  
  const existingTaskIds = new Set(existingTasks.map(t => t.id));
  const trulyOrphaned = allLogs.filter(l => !existingTaskIds.has(l.taskId));
  
  console.log(`Total Error Logs in DB: ${allLogs.length}`);
  console.log(`Truly orphaned Error Logs (no task in DB): ${trulyOrphaned.length}`);
  
  if (trulyOrphaned.length > 0) {
    console.log('Sample truly orphaned log IDs:', trulyOrphaned.slice(0, 5).map(l => l.id));
    
    // Group by user
    const orphanedByUser = await prisma.errorLog.findMany({
      where: { id: { in: trulyOrphaned.map(l => l.id) } },
      select: { userId: true }
    });
    
    const userCounts = {};
    for (const log of orphanedByUser) {
      userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
    }
    
    for (const [userId, count] of Object.entries(userCounts)) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
      console.log(`User ${u ? u.username : userId} has ${count} orphaned error logs.`);
    }
  }
}

main().finally(() => prisma.$disconnect());
