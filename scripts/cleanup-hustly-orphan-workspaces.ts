/**
 * Cleanup: soft-delete 7 orphan workspaces gắn vào Hustly Team từ Sprint Z.12.
 *
 * Context: admin user (deleted in Sprint Z.12) owned 7 workspaces với NULL profileId.
 * Script Z.12 đã attach chúng vào Hustly Team để transfer ownership sang Bảo Phúc
 * thành công. Giờ Bảo Phúc thấy chúng trong dropdown → cleanup.
 *
 * Workspaces target (by id, để chính xác KHÔNG xóa nhầm):
 *   - 4ba5a928 "654654"
 *   - 61b07388 "ThThang 4 2026"
 *   - 1d14912f "Thang 4 2026"
 *   - e3629a38 "Tháng 4/2026" (DUPLICATE - id khác với legit)
 *   - 660be9e2 "zxc"
 *   - 4f1d8f3c "Bug Test Workspace"
 *   - c55bb1a0 "Test 2"
 *
 * Behavior: soft-delete (status=SOFT_DELETED, deletedAt=NOW, hardDeleteAfter=+30d).
 * Bảo Phúc có thể restore qua /admin/workspaces/trash hoặc chờ cron hard-delete.
 *
 * Idempotent: re-runnable safely.
 *
 * Usage:
 *   npx tsx scripts/cleanup-hustly-orphan-workspaces.ts --dry-run
 *   npx tsx scripts/cleanup-hustly-orphan-workspaces.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')

// 7 orphan workspace IDs (verified via probe — full UUID prefix unique)
const ORPHAN_IDS_PREFIX = [
    '4ba5a928', // 654654
    '61b07388', // ThThang 4 2026
    '1d14912f', // Thang 4 2026
    'e3629a38', // Tháng 4/2026 duplicate (legit one is 544ada8f, 106 tasks)
    '660be9e2', // zxc
    '4f1d8f3c', // Bug Test Workspace
    'c55bb1a0', // Test 2
]

async function main() {
    console.log(`=== Cleanup Hustly orphan workspaces ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===\n`)

    const hardDeleteAfter = new Date(Date.now() + 30 * 24 * 3600 * 1000)

    // Match full UUID from prefix
    const workspaces = await prisma.workspace.findMany({
        where: {
            OR: ORPHAN_IDS_PREFIX.map((prefix) => ({ id: { startsWith: prefix } })),
        },
        select: {
            id: true,
            name: true,
            status: true as any,
            _count: { select: { tasks: true } },
        } as any,
    }) as any

    console.log(`Found ${workspaces.length}/7 orphan workspaces:\n`)

    let skipped = 0
    let toDelete: string[] = []
    for (const ws of workspaces) {
        // Safety check: only delete if 0 tasks (extra paranoid)
        if (ws._count.tasks > 0) {
            console.log(`  ⚠️ SKIP "${ws.name}" (id=${ws.id.slice(0, 8)}) — has ${ws._count.tasks} tasks, NOT orphan!`)
            skipped++
            continue
        }
        if (ws.status === 'SOFT_DELETED') {
            console.log(`  ⏭️ ALREADY soft-deleted "${ws.name}" (id=${ws.id.slice(0, 8)})`)
            skipped++
            continue
        }
        console.log(`  ✓ Will soft-delete "${ws.name}" (id=${ws.id.slice(0, 8)})`)
        toDelete.push(ws.id)
    }

    if (DRY_RUN) {
        console.log(`\n💡 Dry-run. Re-run without --dry-run để soft-delete ${toDelete.length} workspaces.`)
        return
    }

    if (toDelete.length === 0) {
        console.log(`\n✅ Nothing to do.`)
        return
    }

    // Apply soft-delete
    const result = await prisma.workspace.updateMany({
        where: { id: { in: toDelete } },
        data: {
            status: 'SOFT_DELETED',
            deletedAt: new Date(),
            hardDeleteAfter,
        } as any,
    })

    console.log(`\n✅ Soft-deleted ${result.count} workspaces.`)
    console.log(`   Auto-hard-delete after: ${hardDeleteAfter.toISOString().slice(0, 10)} (~30 days)`)
    console.log(`   Restore: Bảo Phúc vào /admin → trash → restore individual workspaces nếu cần.`)

    // Audit log entries
    const { audit } = await import('../src/lib/audit-log')
    for (const id of toDelete) {
        await audit({
            workspaceId: id,
            actorUserId: null,
            action: 'workspace.soft_deleted',
            targetType: 'Workspace',
            targetId: id,
            after: {
                reason: 'cleanup-hustly-orphan-from-sprint-z12',
                hardDeleteAfter: hardDeleteAfter.toISOString(),
            },
        }).catch(() => {})
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
