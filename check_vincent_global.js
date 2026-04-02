
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function checkAllVincentTasks() {
  try {
    let output = "--- ALL TASKS FOR VINCENT IN ENTIRE SYSTEM ---\n\n";

    // 2. Find User "Vincent"
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { contains: 'vincent', mode: 'insensitive' } },
          { nickname: { contains: 'vincent', mode: 'insensitive' } }
        ]
      }
    });

    if (!user) return;
    
    // Find all tasks globally
    const tasks = await prisma.task.findMany({
        where: { assigneeId: user.id },
        include: { workspace: { include: { profile: true } } }
    });
    
    let sum = 0;
    const wsMap = {};
    for (const t of tasks) {
        sum += Number(t.value || 0);
        const wsName = t.workspace?.name || 'Unknown Workspace';
        const profileName = t.workspace?.profile?.name || 'Unknown Profile';
        const key = `Profile: ${profileName} | Workspace: ${wsName}`;
        
        if (!wsMap[key]) wsMap[key] = { count: 0, sum: 0 };
        wsMap[key].count++;
        wsMap[key].sum += Number(t.value || 0);
    }
    
    output += `Total Tasks Globally: ${tasks.length}\n`;
    output += `Total Value Globally: ${sum.toLocaleString('vi-VN')} VND\n\n`;
    output += `Breakdown by Workspace:\n`;
    for (const key in wsMap) {
        output += `  ${key} -> ${wsMap[key].count} tasks -> ${wsMap[key].sum.toLocaleString('vi-VN')} VND\n`;
    }

    fs.writeFileSync('vincent_global_tasks.txt', output);
    console.log("Wrote to vincent_global_tasks.txt");

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllVincentTasks();
