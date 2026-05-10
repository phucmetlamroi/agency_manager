/**
 * [Sprint P] Backfill Task.assignedById = workspace OWNER for legacy tasks.
 *
 * Tasks created before Sprint P don't have `assignedById` field. Without
 * backfill, those tasks would silently skip email/notification routing
 * because `task.assignedBy === null`. We backfill to workspace OWNER so:
 *   1. Email logic has a target recipient (no silent drop)
 *   2. AuditLog has actor context
 *   3. UX consistent — old tasks behave like new ones
 *
 * Run: `npx tsx scripts/backfill-task-assigned-by.ts`
 *
 * Idempotent — only updates rows where `assignedById IS NULL`.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('[backfill] Starting Task.assignedById backfill...')

    // Find all tasks missing assignedById
    const tasksToFix = await prisma.task.findMany({
        where: { assignedById: null },
        select: { id: true, workspaceId: true, title: true },
    })

    if (tasksToFix.length === 0) {
        console.log('[backfill] All tasks already have assignedById. Nothing to do.')
        return
    }

    console.log(`[backfill] Found ${tasksToFix.length} legacy tasks to backfill.`)

    // Group by workspace to minimize OWNER lookups
    const byWorkspace = new Map<string, string[]>()
    for (const t of tasksToFix) {
        if (!t.workspaceId) continue // skip orphan tasks
        const arr = byWorkspace.get(t.workspaceId) ?? []
        arr.push(t.id)
        byWorkspace.set(t.workspaceId, arr)
    }

    let updated = 0
    let skipped = 0

    for (const [workspaceId, taskIds] of byWorkspace.entries()) {
        // Find OWNER of this workspace
        const owner = await prisma.workspaceMember.findFirst({
            where: { workspaceId, role: 'OWNER' },
            select: { userId: true },
        })

        if (!owner) {
            console.warn(
                `[backfill] No OWNER found for workspace ${workspaceId} — skipping ${taskIds.length} tasks.`,
            )
            skipped += taskIds.length
            continue
        }

        const result = await prisma.task.updateMany({
            where: { id: { in: taskIds } },
            data: { assignedById: owner.userId },
        })
        console.log(
            `[backfill] Workspace ${workspaceId}: assigned ${result.count} tasks to OWNER ${owner.userId}.`,
        )
        updated += result.count
    }

    console.log(`[backfill] Done. Updated: ${updated}, Skipped: ${skipped}.`)
}

main()
    .catch((e) => {
        console.error('[backfill] FAILED:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
