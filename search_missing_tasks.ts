import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  
  // 1. Find Profile
  const profile = await prisma.profile.findFirst({
    where: { name: { contains: 'Hustly Team', mode: 'insensitive' } }
  })

  if (!profile) {
    console.log('Profile "Hustly Team" not found.')
    return
  }
  console.log(`Found Profile: ${profile.name} (ID: ${profile.id})`)

  // 2. Find Workspace
  const workspace = await prisma.workspace.findFirst({
    where: { 
        profileId: profile.id,
        name: { contains: 'Tháng 3/2026', mode: 'insensitive' } 
    }
  })
  if (workspace) {
      console.log(`Found Target Workspace: ${workspace.name} (ID: ${workspace.id})`)
  } else {
      console.log('Target Workspace "Tháng 3/2026" not found in this profile.')
      const allWorkspaces = await prisma.workspace.findMany({ where: { profileId: profile.id } })
      console.log('Available Workspaces:', allWorkspaces.map(w => w.name).join(', '))
  }

  // 3. Find Client "Smile white"
  const client = await prisma.client.findFirst({
    where: { 
        name: { contains: 'Smile white', mode: 'insensitive' }
    },
    include: { parent: true }
  })

  if (!client) {
    console.log('Client "Smile white" not found.')
  } else {
    console.log(`Found Client: ${client.name} (ID: ${client.id}), Parent: ${client.parent?.name || 'None'}`)
  }

  // 4. Search for Tasks for this client across ALL workspaces
  if (client) {
      const allTasks = await prisma.task.findMany({
          where: { clientId: client.id },
          include: { workspace: true }
      })

      console.log(`\nFound total of ${allTasks.length} tasks for "Smile white":`)
      allTasks.forEach(t => {
          console.log(`- Task ID: ${t.id}, Title: "${t.title}", Status: "${t.status}", Workspace: "${t.workspace?.name || 'Unknown'}" (${t.workspaceId}), isArchived: ${t.isArchived}`)
      })
      
      if (allTasks.length === 0) {
          console.log('Checking for tasks under parent "jacob" that might belong to "Smile white"...')
          const jacob = await prisma.client.findFirst({ where: { name: { contains: 'jacob', mode: 'insensitive' } } })
          if (jacob) {
              const jacobTasks = await prisma.task.findMany({
                  where: { clientId: jacob.id },
                  include: { workspace: true }
              })
              console.log(`Found ${jacobTasks.length} tasks for parent "jacob":`)
              jacobTasks.forEach(t => {
                  console.log(`- Task ID: ${t.id}, Title: "${t.title}", Workspace: "${t.workspace?.name || 'Unknown'}"`)
              })
          }
      }
  }

  await prisma.$disconnect()
}

main()
