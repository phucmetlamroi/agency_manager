
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('--- STARTING AGENCY TASK FIX ---')

    // Find tasks that have an Assignee
    const tasks = await prisma.task.findMany({
        where: {
            assigneeId: { not: null }
        },
        include: {
            assignee: true
        }
    })

    console.log(`Found ${tasks.length} assigned tasks. Checking for inconsistencies...`)

    let fixedCount = 0

    for (const task of tasks) {
        if (!task.assignee) continue

        const assigneeAgencyId = task.assignee.agencyId
        const taskAgencyId = task.assignedAgencyId

        // Case 1: Internal User (assigneeAgencyId is null), but Task has Agency ID
        if (!assigneeAgencyId && taskAgencyId) {
            console.log(`[FIX] Task "${task.title}" assigned to Internal User "${task.assignee.username}" but linked to Agency ${taskAgencyId}. Removing Agency link.`)
            await prisma.task.update({
                where: { id: task.id },
                data: { assignedAgencyId: null }
            })
            fixedCount++
        }
        // Case 2: Agency User, but Task has Different Agency ID (or null)
        else if (assigneeAgencyId && taskAgencyId !== assigneeAgencyId) {
            console.log(`[FIX] Task "${task.title}" assigned to Agency User "${task.assignee.username}" (${assigneeAgencyId}) but linked to Agency ${taskAgencyId || 'NULL'}. Syncing Agency link.`)
            await prisma.task.update({
                where: { id: task.id },
                data: { assignedAgencyId: assigneeAgencyId }
            })
            fixedCount++
        }
    }

    console.log(`--- COMPLETE. Fixed ${fixedCount} tasks. ---`)
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
