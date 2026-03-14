const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      clientId: 21,
      workspaceId: 'legacy-mar-2026'
    },
    select: {
      id: true,
      title: true,
      status: true,
      invoiceStatus: true
    }
  });
  console.log('Total tasks for client 21:', tasks.length);
  tasks.forEach(t => {
     console.log(`- ${t.title}: Status=${t.status}, InvoiceStatus=${t.invoiceStatus}`);
  });
}

main().finally(() => prisma.$disconnect());
