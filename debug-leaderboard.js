const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- USERS ---');
  const users = await prisma.user.findMany({
    select: { id: true, username: true, nickname: true, role: true, profileId: true }
  });
  console.log(JSON.stringify(users, null, 2));

  console.log('--- TASKS WITH ASSIGNEES ---');
  const tasks = await prisma.task.findMany({
    where: { status: 'Hoàn tất' },
    select: { id: true, title: true, assigneeId: true }
  });
  console.log('Unique assigneeIds in completed tasks:', [...new Set(tasks.map(t => t.assigneeId))]);

  console.log('--- PROFILES ---');
  const profiles = await prisma.profile.findMany();
  console.log(JSON.stringify(profiles, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
