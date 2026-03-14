const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      clientId: 21,
      workspaceId: 'legacy-mar-2026',
      invoiceStatus: 'UNBILLED'
    }
  });
  console.log('Unbilled tasks:', tasks.length);
  if (tasks.length > 0) {
    console.log('Sample task IDs:', tasks.slice(0, 3).map(t => t.id));
  }
}

main().finally(() => prisma.$disconnect());
