
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugTasks() {
    const tasks = await prisma.task.findMany({
        where: {
            title: { in: ['JAN 2', 'Jan 2', 'Reel 1'] } // Adjust casing if needed
        },
        include: {
            assignedAgency: true,
            assignee: true
        }
    })

    console.log(JSON.stringify(tasks, null, 2))
}

debugTasks()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
