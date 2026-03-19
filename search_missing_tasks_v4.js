require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Search Results V4 (JS) ---');
    
    // 1. Search for Clients
    const clients = await prisma.client.findMany({
      where: { name: { contains: 'Smile', mode: 'insensitive' } },
      include: { parent: true }
    });
    
    console.log(`Found ${clients.length} matching clients.`);
    for (const c of clients) {
      console.log(`- Client ID: ${c.id}, Name: "${c.name}", Parent: "${c.parent ? c.parent.name : 'None'}"`);
      
      // 2. Search for tasks for each matching client
      const tasks = await prisma.task.findMany({
        where: { clientId: c.id },
        include: { workspace: true, profile: true }
      });
      console.log(`  Found ${tasks.length} tasks for this client:`);
      for (const t of tasks) {
        console.log(`  - Task ID: ${t.id}, Title: "${t.title}", Status: "${t.status}", Workspace: "${t.workspace ? t.workspace.name : 'Unknown'}" (${t.workspaceId}), Profile: "${t.profile ? t.profile.name : 'Unknown'}", isArchived: ${t.isArchived}`);
      }
    }

    if (clients.length === 0) {
      console.log('\nNo Smile white client found. Searching for parent jacob...');
      const jacobs = await prisma.client.findMany({ 
          where: { name: { contains: 'jacob', mode: 'insensitive' } },
          include: { subsidiaries: true }
      });
      for (const j of jacobs) {
          console.log(`- Parent ID: ${j.id}, Name: "${j.name}", SubClients: ${j.subsidiaries.map(sc => sc.name).join(', ')}`);
          const jTasks = await prisma.task.findMany({
              where: { clientId: j.id },
              include: { workspace: true }
          });
          if (jTasks.length > 0) {
              console.log(`  Found ${jTasks.length} tasks directly under jacob.`);
          }
      }
    }
  } catch (err) {
    console.error('Prisma Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
