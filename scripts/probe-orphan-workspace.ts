import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const wsId = 'a6d97ddb-2e9a-44b7-aabd-7b9fbcbcf211'
    const ws = await prisma.workspace.findUnique({
        where: { id: wsId },
        select: {
            id: true,
            name: true,
            profileId: true,
            status: true,
            createdAt: true,
            deletedAt: true,
            members: { select: { userId: true, role: true } },
        },
    })
    console.log('Workspace details:', JSON.stringify(ws, null, 2))

    // What clients exist in this workspace?
    const clients = await prisma.client.findMany({
        where: { tasks: { some: { workspaceId: wsId } } },
        select: { id: true, name: true, parent: { select: { name: true } } },
        take: 10,
    })
    console.log('\nClients with tasks in this workspace:')
    for (const c of clients) console.log(`  ${c.id} ${c.parent?.name ? c.parent.name + ' > ' : ''}${c.name}`)

    // Total tasks in workspace (regardless profileId)
    const allTasks = await prisma.task.count({ where: { workspaceId: wsId } })
    const orphanTasks = await prisma.task.count({ where: { workspaceId: wsId, profileId: null } })
    console.log(`\nTotal tasks: ${allTasks}, profileId=NULL: ${orphanTasks}`)

    // If workspace has members, members likely belong to a profile
    if (ws?.members && ws.members.length > 0) {
        const userIds = ws.members.map((m) => m.userId)
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, profileId: true, profile: { select: { name: true } } },
        })
        console.log('\nMembers + their profiles:')
        for (const u of users) {
            console.log(`  ${u.username}  profileId=${u.profileId?.slice(0, 8) || 'NULL'}  "${u.profile?.name || ''}"`)
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
