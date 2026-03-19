const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });
  try {
    console.log('--- Search Results V5 (JS - No Dotenv) ---');
    console.log('Searching for "Smile" clients...');
    
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
          include: { subClients: true }
      });
      for (const j of jacobs) {
          console.log(`- Parent ID: ${j.id}, Name: "${j.name}"`);
          const jTasks = await prisma.task.findMany({
              where: { clientId: j.id },
              include: { workspace: true, profile: true }
          });
          if (jTasks.length > 0) {
              console.log(`  Found ${jTasks.length} tasks directly under jacob:`);
              for (const t of jTasks) {
                console.log(`    - Task ID: ${t.id}, Title: "${t.title}", Workspace: "${t.workspace ? t.workspace.name : 'Unknown'}"`);
              }
          }
          
          // Check sub-clients for jacob carefully
          const subClients = await prisma.client.findMany({ where: { parentId: j.id } });
          console.log(`  SubClients for jacob (${j.name}): ${subClients.map(sc => sc.name).join(', ')}`);
          for (const sc of subClients) {
              const scTasks = await prisma.task.findMany({ where: { clientId: sc.id }, include: { workspace: true } });
              if (scTasks.length > 0) {
                  console.log(`    - Found ${scTasks.length} tasks for sub-client "${sc.name}" (ID: ${sc.id})`);
                  for (const t of scTasks) {
                    console.log(`      * Task ID: ${t.id}, Title: "${t.title}", Workspace: "${t.workspace ? t.workspace.name : 'Unknown'}"`);
                  }
              }
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
