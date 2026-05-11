/**
 * [Sprint R] One-off data migration:
 * 1. Clear deadline cho 6 task `Quá hạn` ở workspace Tháng 5/2026 (Hustly Team)
 *    — user yêu cầu vì chúng kẹt ở overdue, admin sẽ xử lý lại deadline mới
 * 2. Migrate 1 task `Review` (legacy Sprint A) → `Revision` + clear deadline
 *
 * Idempotent — chỉ update task nào còn match điều kiện. Re-run an toàn.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const WORKSPACE_ID = '0a18fef9-1d1c-432b-ac85-f46c5754e81e' // Tháng 5/2026
const STUCK_TASK_IDS = [
    '4b0ba7da', // Zac / MotoHalo · 8 (Testimonial)
    '4c9d211c', // Zac / MotoHalo · 5
    '6105d3fa', // Zac / MotoHalo · 7
    'd8a0ef0c', // Zac / MotoHalo · 4
    '2d8201e7', // Zac / MotoHalo · 1
    '28bd9310', // Zac / MotoHalo · 6
]

async function main() {
    console.log('=== Sprint R data fix ===\n')

    // 1. Expand short IDs to full UUIDs by querying
    const fullTasks = await prisma.task.findMany({
        where: {
            workspaceId: WORKSPACE_ID,
            OR: STUCK_TASK_IDS.map((shortId) => ({ id: { startsWith: shortId } })),
        },
        select: { id: true, title: true, status: true, deadline: true },
    })

    console.log(`Found ${fullTasks.length}/${STUCK_TASK_IDS.length} stuck Quá hạn tasks:`)
    for (const t of fullTasks) {
        console.log(
            `  ${t.id.slice(0, 8)} status="${t.status}" deadline=${t.deadline?.toISOString().slice(0, 16) || 'null'} title="${t.title}"`,
        )
    }

    if (fullTasks.length === 0) {
        console.log('No matching tasks — script may have already run, exiting.')
        return
    }

    // Clear deadline on Quá hạn tasks
    const stuckUpdate = await prisma.task.updateMany({
        where: {
            id: { in: fullTasks.map((t) => t.id) },
            status: 'Quá hạn', // safety: only clear if still Quá hạn
            deadline: { not: null }, // skip if already cleared
        },
        data: { deadline: null, version: { increment: 1 } },
    })
    console.log(`\n✅ Cleared deadline on ${stuckUpdate.count} Quá hạn tasks.`)

    // 2. Migrate Review → Revision + clear deadline (Sprint A simplification finalize)
    const reviewTasks = await prisma.task.findMany({
        where: {
            workspaceId: WORKSPACE_ID,
            status: 'Review',
        },
        select: { id: true, title: true, deadline: true },
    })

    console.log(`\nFound ${reviewTasks.length} task(s) with legacy status='Review':`)
    for (const t of reviewTasks) {
        console.log(`  ${t.id.slice(0, 8)}  title="${t.title}"`)
    }

    if (reviewTasks.length > 0) {
        const reviewUpdate = await prisma.task.updateMany({
            where: { id: { in: reviewTasks.map((t) => t.id) } },
            data: { status: 'Revision', deadline: null, version: { increment: 1 } },
        })
        console.log(`✅ Migrated ${reviewUpdate.count} Review → Revision (+ cleared deadline).`)
    }

    // Final state report
    console.log('\n=== Final state ===')
    const breakdown = await prisma.task.groupBy({
        by: ['status'],
        where: { workspaceId: WORKSPACE_ID, isArchived: false },
        _count: true,
    })
    for (const g of breakdown) {
        console.log(`  ${g.status}: ${g._count}`)
    }

    const stillStuck = await prisma.task.count({
        where: {
            workspaceId: WORKSPACE_ID,
            status: 'Quá hạn',
            deadline: { not: null },
        },
    })
    console.log(`\nQuá hạn còn deadline (should be 0): ${stillStuck}`)

    const stillReview = await prisma.task.count({
        where: { workspaceId: WORKSPACE_ID, status: 'Review' },
    })
    console.log(`Status='Review' còn lại (should be 0): ${stillReview}`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
