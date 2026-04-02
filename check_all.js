
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function checkAllUsers() {
  try {
    let output = "--- ALL USERS IN KẺ CÔ ĐỘC ---\n\n";
    // 1. Find Profile
    const profile = await prisma.profile.findFirst({
      where: { name: { contains: 'Kẻ', mode: 'insensitive' } }
    });

    if (!profile) return;

    // 2. Find internal workspaces
    const workspaces = await prisma.workspace.findMany({
      where: { profileId: profile.id }
    });
    
    // 3. Find Users within this profile/workspace
    // Fetch all users who have access to this profile via WorkspaceMember or Profile
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: { in: workspaces.map(w => w.id) } },
        include: { user: true }
    });
    
    const uniqueUsers = new Map();
    for (const m of members) {
        if (!uniqueUsers.has(m.userId)) {
            uniqueUsers.set(m.userId, m.user);
        }
    }
    
    for (const user of uniqueUsers.values()) {
        output += `User: ${user.username} (Nickname: ${user.nickname})\n`;
        const tasks = await prisma.task.findMany({
            where: {
                workspaceId: { in: workspaces.map(w => w.id) },
                assigneeId: user.id
            }
        });
        
        let sum = 0;
        let c_sum = 0;
        tasks.forEach(t => {
            sum += Number(t.value || 0);
            if (t.status === 'Hoàn tất') c_sum += Number(t.value || 0);
        });
        
        output += `  Total Tasks Entered: ${tasks.length}\n`;
        output += `  Total Value (All): ${sum.toLocaleString('vi-VN')} VND\n`;
        output += `  Total Value (Hoàn tất): ${c_sum.toLocaleString('vi-VN')} VND\n\n`;
    }
    
    fs.writeFileSync('all_users_output.txt', output);
    console.log("Wrote to all_users_output.txt");

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllUsers();
