import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function getWorkspaceInfo() {
    try {
        const workspace = await prisma.workspace.findFirst()
        console.log('Workspace ID:', workspace?.id)

        const firstClient = await prisma.user.findFirst({ where: { role: 'CLIENT' } })
        if (firstClient) {
            const membership = await prisma.workspaceMember.findFirst({ where: { userId: firstClient.id } })
            console.log(`Client ${firstClient.username} in workspace: ${membership?.workspaceId}`)
        }
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

getWorkspaceInfo()
