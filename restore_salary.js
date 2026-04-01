
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SALARY_COMPLETED_STATUS = 'Ho\u00e0n t\u1ea5t';

async function restore() {
  const tasks = await prisma.task.findMany({
      take: 20,
      orderBy: { updatedAt: 'desc' }
  });
  
  console.log("LAST 20 TASKS (ANY STATUS):");
  tasks.forEach(t => {
      console.log(`ID: ${t.id} | Title: ${t.title.substring(0,25)} | Status: ${t.status} | Value: ${t.value} | User: ${t.assigneeId} | Workspace: ${t.workspaceId}`);
  });

  const statuses = await prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true }
  });
  console.log("\nALL STATUSES IN DB:", statuses);

  const completed = await prisma.task.findMany({
      where: { status: SALARY_COMPLETED_STATUS },
      include: { workspace: true },
      take: 10
  });
  console.log("\nCOMPLETED SAMPLES:", completed.map(c => ({ id: c.id, title: c.title, ws: c.workspace?.name, date: c.updatedAt })));
}

restore().catch(console.error).finally(() => prisma.$disconnect());
