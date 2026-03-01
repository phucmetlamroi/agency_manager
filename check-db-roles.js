const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function check() {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true }
    })
    console.log('--- USERS ---')
    console.log(users)

    const workspaces = await prisma.workspace.findMany()
    console.log('\n--- WORKSPACES ---')
    console.log(workspaces)

    const members = await prisma.workspaceMember.findMany({
        include: { workspace: true, user: true }
    })
    console.log('\n--- MEMBERSHIPS ---')
    console.log(members.map(m => ({
        username: m.user.username,
        workspace: m.workspace.name,
        workspaceId: m.workspaceId,
        role: m.role
    })))
}

check().catch(console.error).finally(() => prisma.$disconnect())
