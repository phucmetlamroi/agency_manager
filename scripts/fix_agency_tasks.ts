import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('--- COMPREHENSIVE AGENCY TASK FIX ---')
    console.log('Checking for ALL task assignment inconsistencies...\n')

    // Find ALL tasks (assigned or not)
    const tasks = await prisma.task.findMany({
        include: {
            assignee: true
        }
    })

    console.log(`Total tasks in database: ${tasks.length}`)

    let fixedCount = 0
    let alreadyCorrect = 0

    for (const task of tasks) {
        const assigneeAgencyId = task.assignee?.agencyId || null
        const taskAgencyId = task.assignedAgencyId

        // Expected: assignedAgencyId should match assignee's agencyId (or both null if no assignee)
        const isCorrect = assigneeAgencyId === taskAgencyId

        if (isCorrect) {
            alreadyCorrect++
            continue
        }

        // INCONSISTENCY FOUND
        console.log(`\n[MISMATCH] Task: "${task.title}" (${task.id.substring(0, 8)}...)`)
        console.log(`  Assignee: ${task.assignee?.username || 'NONE'}`)
        console.log(`  Assignee's Agency: ${assigneeAgencyId || 'NONE (Internal)'}`)
        console.log(`  Task's assignedAgencyId: ${taskAgencyId || 'NONE'}`)
        console.log(`  Action: Setting assignedAgencyId = ${assigneeAgencyId || 'NULL'}`)

        await prisma.task.update({
            where: { id: task.id },
            data: { assignedAgencyId: assigneeAgencyId }
        })

        fixedCount++
    }

    console.log(`\n--- COMPLETE ---`)
    console.log(`Total Checked: ${tasks.length}`)
    console.log(`Already Correct: ${alreadyCorrect}`)
    console.log(`Fixed: ${fixedCount}`)
}

main()
    .catch(e => console.error('ERROR:', e))
    .finally(async () => await prisma.$disconnect())
