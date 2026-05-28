/**
 * Data fix: Clear deadline cho task vi phạm status↔deadline invariant.
 *
 * Spec (Sprint A finalized):
 *   - status ∈ ['Revision', 'Hoàn tất']  →  deadline phải = null
 *
 * Root cause: `bulkUpdateStatus` (drag-drop ≥2 task) trước đây bug — chỉ clear
 * deadline khi drag sang 'Đang đợi giao', KHÔNG clear khi drag sang Revision/Hoàn tất.
 * → Một số task (vd Jacob/Kash Timeline 6+7) bị stuck status=Revision + deadline still set.
 *
 * Code fix đã merge — function `bulkUpdateStatus` giờ enforce invariant.
 * Script này dọn legacy data.
 *
 * SCOPE (default):
 *   - Chỉ clear task ở status 'Revision' (user-requested narrow scope)
 *   - Task 'Hoàn tất' legacy GIỮ deadline cũ làm dữ liệu lịch sử
 *
 * Pass --include-completed để mở rộng sang task 'Hoàn tất'.
 *
 * SAFE:
 *   - Idempotent (re-run OK)
 *   - Không đụng task ở status khác (Đang thực hiện, Nhận task, etc.)
 *   - Bump version để các client cũ sync optimistic state
 *
 * Run dry:  npx tsx scripts/fix-status-deadline-invariant.ts
 * Run live: npx tsx scripts/fix-status-deadline-invariant.ts --fix
 * Mở rộng: npx tsx scripts/fix-status-deadline-invariant.ts --fix --include-completed
 */

import { prisma } from '../src/lib/db'

async function main() {
    const dryRun = !process.argv.includes('--fix')
    const includeCompleted = process.argv.includes('--include-completed')
    const targetStatuses = includeCompleted ? ['Revision', 'Hoàn tất'] : ['Revision']
    const mode = dryRun ? 'DRY RUN' : '🔧 LIVE FIX'

    console.log('═'.repeat(78))
    console.log(`Status↔Deadline invariant fix — ${mode}`)
    console.log('Target statuses (deadline must be null):', targetStatuses.join(', '))
    if (!includeCompleted) {
        console.log('(Pass --include-completed để mở rộng sang Hoàn tất legacy data.)')
    }
    console.log('═'.repeat(78))

    // 1. Find violations
    const violations = await prisma.task.findMany({
        where: {
            status: { in: targetStatuses },
            deadline: { not: null },
            isArchived: false,
        },
        select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            workspaceId: true,
            workspace: { select: { name: true, profile: { select: { name: true } } } },
            assignee: { select: { username: true, displayName: true } },
            updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
    })

    console.log(`\n📊 Found ${violations.length} task(s) violating invariant:\n`)

    if (violations.length === 0) {
        console.log('✓ Không có task nào vi phạm invariant. Đã clean.')
        return
    }

    // Group by workspace for readability
    const byWorkspace = new Map<string, typeof violations>()
    for (const t of violations) {
        const key = `${t.workspace?.profile?.name || '?'} / ${t.workspace?.name || '?'}`
        if (!byWorkspace.has(key)) byWorkspace.set(key, [])
        byWorkspace.get(key)!.push(t)
    }

    for (const [wsName, tasks] of byWorkspace.entries()) {
        console.log(`📍 ${wsName} (${tasks.length} task)`)
        for (const t of tasks) {
            const assignee = t.assignee?.displayName || t.assignee?.username || '(unassigned)'
            console.log(
                `   ${t.id.slice(0, 8)} | ${t.status.padEnd(10)} | deadline=${t.deadline?.toISOString().slice(0, 16)} | ${assignee} | ${t.title.slice(0, 60)}`,
            )
        }
        console.log('')
    }

    if (dryRun) {
        console.log('═'.repeat(78))
        console.log(`💡 ${violations.length} task(s) sẽ được fix nếu chạy với --fix`)
        console.log('═'.repeat(78))
        return
    }

    // 2. Apply fix
    console.log('═'.repeat(78))
    console.log('Applying fix...')

    const result = await prisma.task.updateMany({
        where: {
            id: { in: violations.map((t) => t.id) },
            // Re-check status để idempotent (nếu race condition giữa probe + update)
            status: { in: targetStatuses },
            deadline: { not: null },
        },
        data: {
            deadline: null,
            version: { increment: 1 },
        },
    })

    console.log(`\n✅ Cleared deadline trên ${result.count} task.`)

    // 3. Audit log entries (best-effort)
    try {
        const { audit } = await import('../src/lib/audit-log')
        await audit({
            workspaceId: violations[0].workspaceId,
            actorUserId: null,
            action: 'task.bulk_status_updated',
            targetType: 'Task',
            targetId: `${result.count}-tasks`,
            after: {
                source: 'data_fix_script',
                reason: 'Clear deadline cho task ở status Revision/Hoàn tất (Sprint A invariant)',
                count: result.count,
                taskIds: violations.map((t) => t.id),
            },
        })
        console.log('✅ Audit log entry created.')
    } catch (err) {
        console.warn('⚠️  Audit log failed (non-fatal):', err)
    }

    // 4. Verify
    const stillViolating = await prisma.task.count({
        where: {
            status: { in: targetStatuses },
            deadline: { not: null },
            isArchived: false,
        },
    })
    console.log(`\nViolations còn lại trong scope (should be 0): ${stillViolating}`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
