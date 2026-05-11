/**
 * Restore task "Ryan · 02 VSL" (id starts with 09601a05).
 * Migrate status='Review' (legacy) → 'Revision' + clear deadline (Sprint A pattern).
 *
 * Also scan ALL tasks for invalid statuses (not in canonical list) as audit.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const VALID_STATUSES = [
    'Đang đợi giao',
    'Nhận task',
    'Đã nhận task',
    'Đang thực hiện',
    'Revision',
    'Sửa frame',
    'Gửi lại',
    'Tạm ngưng',
    'Quá hạn',
    'Hoàn tất',
    'Đã hủy',
]

async function main() {
    console.log('=== Sprint W: Restore Ryan · 02 VSL + audit unknown statuses ===\n')

    // 1. Audit unknown statuses
    const all = await prisma.task.findMany({
        select: { id: true, title: true, status: true, workspaceId: true, profileId: true },
    })
    const unknown = all.filter((t) => !VALID_STATUSES.includes(t.status))
    console.log(`Tasks with INVALID status: ${unknown.length}`)
    for (const t of unknown) {
        console.log(`  ${t.id.slice(0, 8)} status="${t.status}" ws=${t.workspaceId?.slice(0, 8)} title="${t.title?.slice(0, 50)}"`)
    }

    // 2. Migrate any Review → Revision + clear deadline
    const reviewTasks = await prisma.task.findMany({
        where: { status: 'Review' },
        select: { id: true, title: true },
    })
    console.log(`\nMigrating ${reviewTasks.length} 'Review' tasks → 'Revision':`)
    for (const t of reviewTasks) {
        console.log(`  ${t.id.slice(0, 8)} "${t.title}"`)
    }
    if (reviewTasks.length > 0) {
        const result = await prisma.task.updateMany({
            where: { status: 'Review' },
            data: { status: 'Revision', deadline: null, version: { increment: 1 } },
        })
        console.log(`✅ Updated ${result.count} task(s).`)
    }

    // 3. Verify
    console.log('\n=== Verification ===')
    const stillReview = await prisma.task.count({ where: { status: 'Review' } })
    console.log(`Tasks with status='Review' remaining: ${stillReview} (should be 0)`)

    // 4. Check fixed task
    const fixed = await prisma.task.findFirst({
        where: { id: { startsWith: '09601a05' } },
        select: { id: true, title: true, status: true, deadline: true },
    })
    console.log(`\nFixed task: ${JSON.stringify(fixed)}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
