/**
 * [Z+1.fix8] Diagnostic + repair script for assigneeId ↔ status invariant.
 *
 * Finds tasks with inconsistent assigneeId/status:
 *   Type A: assigneeId SET + status "Đang đợi giao" → fix status → "Nhận task"
 *   Type B: assigneeId NULL + status NOT "Đang đợi giao" → fix status → "Đang đợi giao"
 *
 * Usage:
 *   npx tsx scripts/fix-sprint-z1fix8-assignee-status-invariant.ts          # DRY RUN (default)
 *   npx tsx scripts/fix-sprint-z1fix8-assignee-status-invariant.ts --fix    # APPLY FIXES
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const FIX_MODE = process.argv.includes('--fix')

async function main() {
    console.log(`\n=== [Z+1.fix8] assigneeId ↔ status invariant check ===`)
    console.log(`Mode: ${FIX_MODE ? '🔧 FIX (will modify DB)' : '👀 DRY RUN (read-only)'}\n`)

    // Type A: assigneeId SET + status "Đang đợi giao"
    const typeA = await prisma.task.findMany({
        where: {
            assigneeId: { not: null },
            status: 'Đang đợi giao',
        },
        select: {
            id: true,
            title: true,
            status: true,
            assigneeId: true,
            workspaceId: true,
            assignee: { select: { username: true, nickname: true } },
        },
    })

    console.log(`--- Type A: assigneeId SET + status "Đang đợi giao" (${typeA.length} found) ---`)
    for (const t of typeA) {
        const name = t.assignee?.nickname || t.assignee?.username || t.assigneeId
        console.log(`  [${t.id.slice(0, 8)}] "${t.title}" — assignee: ${name} — ws: ${t.workspaceId?.slice(0, 8)}`)
        if (FIX_MODE) {
            await prisma.task.update({
                where: { id: t.id },
                data: { status: 'Nhận task' },
            })
            console.log(`    ✅ Fixed: status → "Nhận task"`)
        }
    }

    // Type B: assigneeId NULL + status NOT "Đang đợi giao"
    // Exclude terminal statuses that legitimately have null assignee
    const typeB = await prisma.task.findMany({
        where: {
            assigneeId: null,
            status: { notIn: ['Đang đợi giao', 'Đã hủy'] },
        },
        select: {
            id: true,
            title: true,
            status: true,
            workspaceId: true,
        },
    })

    console.log(`\n--- Type B: assigneeId NULL + status NOT "Đang đợi giao" (${typeB.length} found) ---`)
    for (const t of typeB) {
        console.log(`  [${t.id.slice(0, 8)}] "${t.title}" — status: "${t.status}" — ws: ${t.workspaceId?.slice(0, 8)}`)
        if (FIX_MODE) {
            await prisma.task.update({
                where: { id: t.id },
                data: { status: 'Đang đợi giao', deadline: null },
            })
            console.log(`    ✅ Fixed: status → "Đang đợi giao", deadline cleared`)
        }
    }

    // Summary
    console.log(`\n=== Summary ===`)
    console.log(`Type A (assigned + queue status): ${typeA.length}`)
    console.log(`Type B (unassigned + active status): ${typeB.length}`)
    console.log(`Total inconsistent: ${typeA.length + typeB.length}`)

    if (!FIX_MODE && (typeA.length + typeB.length) > 0) {
        console.log(`\n💡 Run with --fix to apply repairs:`)
        console.log(`   npx tsx scripts/fix-sprint-z1fix8-assignee-status-invariant.ts --fix`)
    }

    if (FIX_MODE) {
        console.log(`\n✅ All fixes applied.`)
    }
}

main()
    .catch((e) => {
        console.error('Script failed:', e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
