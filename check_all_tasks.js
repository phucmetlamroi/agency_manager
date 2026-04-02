
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function checkTasks() {
  try {
    let output = "--- ALL TASKS IN KẺ CÔ ĐỘC ---\n\n";
    // 1. Find Profile
    const profile = await prisma.profile.findFirst({
      where: { name: { contains: 'Kẻ', mode: 'insensitive' } }
    });

    if (!profile) return;
    
    // Find all users who have entered a task in this profile's workspaces
    const workspaces = await prisma.workspace.findMany({
      where: { profileId: profile.id }
    });
    const wsIds = workspaces.map(w => w.id);

    // Group tasks by assignee
    const tasks = await prisma.task.findMany({
        where: { workspaceId: { in: wsIds }, assigneeId: { not: null } },
        include: { assignee: true }
    });
    
    const userStats = {};
    for (const t of tasks) {
       const u = t.assignee;
       if (!userStats[u.id]) userStats[u.id] = { username: u.username, nickname: u.nickname, count: 0, sum: 0 };
       userStats[u.id].count++;
       userStats[u.id].sum += Number(t.value || 0);
    }
    
    for (const id in userStats) {
       output += `User: ${userStats[id].username} (Nick: ${userStats[id].nickname}) | Tasks: ${userStats[id].count} | Expected Sum: ${userStats[id].sum.toLocaleString('vi-VN')} VND\n`;
    }
    
    if (Object.keys(userStats).length === 0) output += 'No tasks found for any user in this profile.\n';

    fs.writeFileSync('all_tasks_kcd.txt', output);
    console.log("Wrote to all_tasks_kcd.txt");

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTasks();
