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

        // FIXED VALIDATION LOGIC:
        // Valid scenarios:
        // 1. No assignee + no agency = Global pool ✓
        // 2. No assignee + has agency = Agency pool (UNASSIGNED) ✓ <-- THIS WAS MISSING BEFORE
        // 3. Has assignee (internal) + no agency ✓
        // 4. Has assignee (agency user) + agencies match ✓

        let isCorrect = false

        if (!task.assigneeId) {
            // Unassigned task - can be in global queue OR agency pool
            // Both states are valid, no fix needed
            isCorrect = true
        } else {
            // Assigned task - assignedAgencyId MUST match assignee's agency
            isCorrect = assigneeAgencyId === taskAgencyId
        }

        if (isCorrect) {
            alreadyCorrect++
            continue
        }

        // INCONSISTENCY FOUND (only for ASSIGNED tasks now)
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
