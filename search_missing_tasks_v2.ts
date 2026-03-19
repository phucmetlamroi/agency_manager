import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log('--- Search Results ---')
    
    // 1. All Clients with 'Smile'
    const clients = await prisma.client.findMany({
      where: { name: { contains: 'Smile', mode: 'insensitive' } },
      include: { parent: true }
    })
    console.log(`Found ${clients.length} matching clients.`)
    clients.forEach(c => {
      console.log(`- ID: ${c.id}, Name: "${c.name}", Parent: ${c.parent?.name || 'None'}`)
    })

    const targetClientIds = clients.map(c => c.id)

    // 2. Search for Tasks for these clients
    if (targetClientIds.length > 0) {
      const tasks = await prisma.task.findMany({
        where: { clientId: { in: targetClientIds } },
        include: { workspace: true }
      })
      console.log(`\nFound ${tasks.length} tasks for these clients:`)
      tasks.forEach(t => {
        console.log(`- Task ID: ${t.id}, Title: "${t.title}", Status: "${t.status}", Workspace: "${t.workspace?.name || 'Unknown'}" (${t.workspaceId}), isArchived: ${t.isArchived}`)
      })
    } else {
        // Broad search: maybe searching by parent 'jacob'
        const jacobs = await prisma.client.findMany({ where: { name: { contains: 'jacob', mode: 'insensitive' } } })
        console.log(`\nFound ${jacobs.length} jacob-like clients.`)
        for (const j of jacobs) {
            const subClients = await prisma.client.findMany({ where: { parentId: j.id } })
            console.log(` Jacob ID ${j.id} (${j.name}) has ${subClients.length} sub-clients.`)
            subClients.forEach(sc => console.log(`   - ID: ${sc.id}, Name: "${sc.name}"`))
            
            const jTasks = await prisma.task.findMany({
                where: { clientId: j.id },
                include: { workspace: true }
            })
            if (jTasks.length > 0) {
                console.log(` Found ${jTasks.length} tasks directly under jacob.`)
            }
        }
    }
  } catch (err) {
    console.error('Prisma Error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
