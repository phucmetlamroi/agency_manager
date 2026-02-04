
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function fixTaskStates() {
    console.log("Scanning for inconsistent tasks...")

    // Find tasks that are Waiting but have Running Timer
    const inconsistentTasks = await prisma.task.findMany({
        where: {
            timerStatus: 'RUNNING',
            status: 'Đang đợi giao'
            // We assume if Timer is RUNNING, it MUST be 'Doing' (or 'Revision' etc, but specifically NOT 'Waiting')
        }
    })

    console.log(`Found ${inconsistentTasks.length} inconsistent tasks.`)

    for (const task of inconsistentTasks) {
        console.log(`Fixing Status for Task: ${task.title} (${task.id})`)

        await prisma.task.update({
            where: { id: task.id },
            data: {
                status: 'Đang thực hiện' // Force to "Doing"
            }
        })
    }

    // Also check for tasks that are "Doing" but have NO Time Log and NO Assignee? 
    // Maybe not. Focus on the reported issue.

    console.log("Fix complete.")
}

fixTaskStates()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
