
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function checkSalary() {
  try {
    let output = "";
    // 1. Find Profile
    const profile = await prisma.profile.findFirst({
      where: { name: { contains: 'Kẻ', mode: 'insensitive' } }
    });

    if (!profile) {
      output += 'Profile not found.\n';
      fs.writeFileSync('vincent_output.txt', output);
      return;
    }
    output += `Found Profile: ${profile.name} (${profile.id})\n`;

    // 2. Find User "Vincent"
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { contains: 'vincent', mode: 'insensitive' } },
          { nickname: { contains: 'vincent', mode: 'insensitive' } }
        ]
      }
    });

    if (!user) {
      output += 'User Vincent not found.\n';
      fs.writeFileSync('vincent_output.txt', output);
      return;
    }
    output += `Found User: ${user.username} (Nickname: ${user.nickname}) - ID: ${user.id}\n`;

    // 3. Find Workspaces for this profile
    const workspaces = await prisma.workspace.findMany({
      where: { profileId: profile.id }
    });
    output += `Found ${workspaces.length} workspaces for this profile.\n`;

    // 4. Get Tasks for Vincent in these workspaces
    for (const ws of workspaces) {
      output += `\n--- Workspace: ${ws.name} (${ws.id}) ---\n`;
      
      const tasks = await prisma.task.findMany({
        where: {
          workspaceId: ws.id,
          assigneeId: user.id
        },
        include: {
           client: { select: { name: true } }
        }
      });
      
      output += `Total Tasks for ${user.username}: ${tasks.length}\n`;
      
      const statusCounts = {};
      let totalValueAll = 0;
      let totalValueCompleted = 0;
      let totalValuePending = 0;

      const taskDetails = [];

      for (const t of tasks) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
        const val = Number(t.value || 0);
        totalValueAll += val;
        
        if (t.status === 'Hoàn tất') {
          totalValueCompleted += val;
        } else if (['Đang nhận', 'Đang thực hiện', 'Review', 'Revision', 'Gửi lại'].includes(t.status)) {
          totalValuePending += val;
        }

        taskDetails.push({
           id: t.id.substring(0,8),
           title: t.title.substring(0, 30),
           status: t.status,
           value: val,
           client: t.client?.name
        });
      }

      output += `Status Counts: ${JSON.stringify(statusCounts, null, 2)}\n`;
      output += `Total Value (ALL Tasks): ${totalValueAll.toLocaleString('vi-VN')} VND\n`;
      output += `Total Value (Hoàn tất): ${totalValueCompleted.toLocaleString('vi-VN')} VND\n`;
      output += `Total Value (Pending): ${totalValuePending.toLocaleString('vi-VN')} VND\n\n`;
      
      // Print tasks to spot outliers
      taskDetails.sort((a, b) => b.value - a.value);
      output += 'Top 30 tasks by value:\n';
      taskDetails.slice(0, 30).forEach(t => {
        output += `  [${t.status}] ${t.value.toLocaleString('vi-VN')} VND - ${t.title} (Client: ${t.client})\n`;
      });
    }
    
    fs.writeFileSync('vincent_output.txt', output);
    console.log("Wrote to vincent_output.txt");

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSalary();
