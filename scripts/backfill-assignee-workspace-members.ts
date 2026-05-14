/**
 * Backfill: auto-create WorkspaceMember(role='MEMBER') cho mọi user là task
 * assignee nhưng KHÔNG có WorkspaceMember row trong workspace task đó.
 *
 * Sprint Z removed "same profile = auto-MEMBER" fallback → 83 (user, workspace)
 * pairs hiện bị block khi cố update task. Fix: explicit WorkspaceMember row.
 *
 * Idempotent: re-runnable. Chỉ tạo MEMBER nếu thiếu.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
    console.log(`=== Backfill assignee WorkspaceMember ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===\n`)

    // Gather all unique (assigneeId, workspaceId) pairs
    const tasks = await prisma.task.findMany({
        where: {
            assigneeId: { not: null },
            workspaceId: { not: null },
        },
        select: { assigneeId: true, workspaceId: true },
    })
    const pairs = new Map<string, { userId: string; workspaceId: string }>()
    for (const t of tasks) {
        const key = `${t.assigneeId}:${t.workspaceId}`
        if (!pairs.has(key)) pairs.set(key, { userId: t.assigneeId!, workspaceId: t.workspaceId! })
    }
    console.log(`Total unique (assignee, workspace) pairs: ${pairs.size}`)

    // Filter to those without WorkspaceMember
    let toCreate: { userId: string; workspaceId: string }[] = []
    for (const p of pairs.values()) {
        const exists = await prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: p.userId, workspaceId: p.workspaceId } },
        })
        if (!exists) toCreate.push(p)
    }

    console.log(`Missing WorkspaceMember: ${toCreate.length}`)
    if (toCreate.length === 0) {
        console.log(`\n✅ Nothing to backfill.`)
        return
    }

    if (DRY_RUN) {
        console.log(`\n💡 Dry-run. Would create ${toCreate.length} WorkspaceMember rows (role=MEMBER).`)
        return
    }

    // Create in batches để tránh timeout
    let created = 0
    let failed = 0
    for (const p of toCreate) {
        try {
            await prisma.workspaceMember.create({
                data: {
                    userId: p.userId,
                    workspaceId: p.workspaceId,
                    role: 'MEMBER',
                },
            })
            created++
        } catch (e: any) {
            // P2002 unique constraint — race or already exists
            if (e?.code !== 'P2002') {
                console.warn(`  ⚠️ Failed (${p.userId.slice(0, 8)}, ${p.workspaceId.slice(0, 8)}): ${e.message}`)
                failed++
            }
        }
    }

    console.log(`\n✅ Created ${created} WorkspaceMember rows (role=MEMBER), ${failed} failures.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
