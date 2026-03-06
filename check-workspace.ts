import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkWorkspace() {
    try {
        const task = await prisma.task.findFirst()
        console.log('Task Title:', task?.title)
        console.log('Task Workspace:', task?.workspaceId)
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkWorkspace()
