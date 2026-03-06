import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkMemberships() {
    try {
        const users = await prisma.user.findMany({
            where: { role: 'CLIENT' },
            select: {
                username: true,
                workspaces: {
                    select: { workspaceId: true }
                }
            }
        })
        console.log('--- Client Workspace Memberships ---')
        users.forEach(u => {
            console.log(`${u.username}: ${u.workspaces.map(m => m.workspaceId).join(', ')}`)
        })

        const workspaces = await prisma.workspace.findMany({
            select: { id: true }
        })
        console.log('\n--- All Workspaces ---')
        workspaces.forEach(w => console.log(w.id))

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkMemberships()
