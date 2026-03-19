import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log('--- Search Results V3 ---')
    
    // 1. All Clients with 'Smile'
    const clients = await prisma.client.findMany({
      where: { name: { contains: 'Smile', mode: 'insensitive' } },
      include: { parent: true }
    })
    console.log(`Found ${clients.length} matching clients.`)
    clients.forEach(c => {
      console.log(`- Client ID: ${c.id}, Name: "${c.name}", Parent: "${c.parent?.name || 'None'}"`)
    })

    const targetClientIds = clients.map(c => c.id)

    // 2. Search for Tasks for these clients across ALL workspaces and profiles
    if (targetClientIds.length > 0) {
      const tasks = await prisma.task.findMany({
        where: { clientId: { in: targetClientIds } },
        include: { workspace: true, profile: true }
      })
      console.log(`\nFound ${tasks.length} tasks for these clients:`)
      tasks.forEach(t => {
        console.log(`- Task ID: ${t.id}, Title: "${t.title}", Status: "${t.status}", Workspace: "${t.workspace?.name || 'Unknown'}" (${t.workspaceId}), Profile: "${t.profile?.name || 'Unknown'}", isArchived: ${t.isArchived}`)
      })
    } else {
        console.log('\nNo Smile white client found. Searching for parent jacob...')
        const jacobs = await prisma.client.findMany({ 
            where: { name: { contains: 'jacob', mode: 'insensitive' } },
            include: { subClients: true }
        })
        for (const j of jacobs) {
            console.log(`- Parent ID: ${j.id}, Name: "${j.name}", SubClients: ${j.subClients.map(sc => sc.name).join(', ')}`)
            const jTasks = await prisma.task.findMany({
                where: { clientId: j.id },
                include: { workspace: true }
            })
            if (jTasks.length > 0) {
                console.log(`  Found ${jTasks.length} tasks directly under jacob.`)
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
