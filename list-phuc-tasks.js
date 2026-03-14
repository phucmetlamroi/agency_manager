const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { username: 'Bao Phuc' } });
  if (!user) return;
  
  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id }
  });
  
  console.log(`User: ${user.username} has ${tasks.length} total tasks.`);
  tasks.forEach(t => {
    console.log(`- Task: ${t.title} (${t.id}), Status: ${t.status}, Archived: ${t.isArchived}`);
  });
}

main().finally(() => prisma.$disconnect());
