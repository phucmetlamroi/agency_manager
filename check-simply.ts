import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkSimplyMedicalsTasks() {
    try {
        const tasks = await prisma.task.findMany({
            where: { clientId: 2 },
            select: { title: true, workspaceId: true }
        })
        console.log('--- Simply Medicals Tasks ---')
        tasks.forEach(t => {
            console.log(`Task: ${t.title.padEnd(20)} | Workspace: ${t.workspaceId}`)
        })
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkSimplyMedicalsTasks()
