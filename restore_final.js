
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SALARY_COMPLETED_STATUS = 'Ho\u00e0n t\u1ea5t';

async function restoreAll() {
  const workspaces = await prisma.workspace.findMany();
  
  for (const ws of workspaces) {
      if (!ws.name.includes("Tháng 3/2026")) continue;
      
      console.log(`\nStarting restoration for Workspace: ${ws.name} (${ws.id})`);
      const profileId = ws.profileId;

      const startMarch = new Date(2026, 2, 1);
      const endMarch = new Date(2026, 3, 10); // Extend to be safe

      const completedTasks = await prisma.task.findMany({
        where: {
          workspaceId: ws.id,
          status: SALARY_COMPLETED_STATUS,
          updatedAt: { gte: startMarch, lte: endMarch }
        }
      });

      console.log(`Found ${completedTasks.length} tasks.`);

      const totals = {};
      completedTasks.forEach(t => {
          if (!t.assigneeId) return;
          totals[t.assigneeId] = (totals[t.assigneeId] || 0) + Number(t.value || 0);
      });

      for (const [userId, amount] of Object.entries(totals)) {
          if (amount <= 0) continue;
          console.log(`- Restoring User ${userId}: ${amount} VND`);
          
          await prisma.payroll.upsert({
              where: {
                  userId_month_year_workspaceId: {
                      userId,
                      month: 3,
                      year: 2026,
                      workspaceId: ws.id
                  }
              },
              update: {
                  baseSalary: amount,
                  totalAmount: amount,
                  status: 'UNPAID'
              },
              create: {
                  userId,
                  month: 3,
                  year: 2026,
                  workspaceId: ws.id,
                  profileId,
                  baseSalary: amount,
                  totalAmount: amount,
                  status: 'UNPAID'
              }
          });
      }
  }
  console.log("\n✅ Done.");
}

restoreAll().catch(console.error).finally(() => prisma.$disconnect());
