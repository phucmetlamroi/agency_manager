import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function listAllTasks() {
    try {
        const tasks = await prisma.task.findMany({
            take: 20,
            select: {
                id: true,
                title: true,
                clientId: true,
                clientUserId: true,
                client: { select: { name: true } }
            }
        })
        console.log('--- All Tasks (Sample) ---')
        tasks.forEach(t => {
            console.log(`Task: ${t.title.padEnd(30)} | Client: ${t.client?.name.padEnd(15)} | clientId: ${t.clientId} | clientUserId: ${t.clientUserId}`)
        })
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

listAllTasks()
