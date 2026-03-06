import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTaskOwners() {
    try {
        const tasks = await prisma.task.findMany({
            include: { client: true }
        })
        console.log(`Found ${tasks.length} total tasks.`)

        const clientNames = new Set(tasks.map(t => t.client?.name || 'Unknown'))
        console.log('Client names found in Tasks:', Array.from(clientNames))

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkTaskOwners()
