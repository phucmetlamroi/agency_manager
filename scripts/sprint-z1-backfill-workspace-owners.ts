/**
 * [Sprint Z+1] Convert all WorkspaceMember.role='OWNER' rows → 'ADMIN'.
 *
 * Sprint Z đã setup verifyWorkspaceAccess return workspaceRole='OWNER' khi user
 * là Profile OWNER (implicit). Workspace-level OWNER concept không còn cần thiết.
 *
 * Pre-flight: 35 OWNER rows expected (1 per workspace per Sprint Z verify).
 * Post-flight: 0 OWNER rows. Profile OWNERS vẫn có access vì implicit grant.
 *
 * Idempotent: re-runnable safely.
 *
 * Usage:
 *   npx tsx scripts/sprint-z1-backfill-workspace-owners.ts --dry-run
 *   npx tsx scripts/sprint-z1-backfill-workspace-owners.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
    console.log(`=== [Sprint Z+1] Convert WorkspaceMember.OWNER → ADMIN ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===\n`)

    const ownerships = await prisma.workspaceMember.findMany({
        where: { role: 'OWNER' },
        select: {
            userId: true,
            workspaceId: true,
            user: { select: { username: true, nickname: true, displayName: true } },
            workspace: {
                select: {
                    name: true,
                    profileId: true,
                    profile: { select: { name: true } },
                },
            },
        },
    })

    console.log(`Tìm thấy ${ownerships.length} WorkspaceMember rows với role='OWNER':\n`)

    // Group by workspace cho dễ đọc
    for (const o of ownerships.slice(0, 10)) {
        const userName = o.user.nickname ?? o.user.displayName ?? o.user.username
        const wsName = o.workspace.name
        const profileName = o.workspace.profile?.name ?? '?'
        console.log(`  • ${userName} → "${wsName}" (profile: ${profileName})`)
    }
    if (ownerships.length > 10) {
        console.log(`  ... +${ownerships.length - 10} more`)
    }

    if (DRY_RUN) {
        console.log(`\n💡 Dry-run. Re-run without --dry-run để convert ${ownerships.length} rows → ADMIN.`)
        return
    }

    // [Sprint Z+1] Drop DB-level trigger ensure_workspace_owner_exists (blocks
    // demoting last OWNER). Workspace OWNER concept being removed; Profile OWNER
    // is now the source of truth.
    console.log(`\nDropping DB trigger ensure_workspace_owner_exists...`)
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ensure_workspace_owner_exists ON "WorkspaceMember"`)
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS enforce_workspace_owner_count() CASCADE`)
    console.log(`✅ Trigger dropped.`)

    // Apply conversion
    const result = await prisma.workspaceMember.updateMany({
        where: { role: 'OWNER' },
        data: { role: 'ADMIN' },
    })

    console.log(`\n✅ Converted ${result.count} WorkspaceMember rows từ OWNER → ADMIN.`)

    // Verify: 0 rows still OWNER
    const remaining = await prisma.workspaceMember.count({ where: { role: 'OWNER' } })
    if (remaining === 0) {
        console.log(`✅ Verified: 0 OWNER rows remaining.`)
    } else {
        console.log(`⚠️ ${remaining} rows still have role='OWNER' — manual check needed.`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
