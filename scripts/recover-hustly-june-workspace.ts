/**
 * RECOVERY: rebuild Hustly Team's deleted "Tháng 6/2026" workspace and re-attach its
 * 119 orphaned tasks (Task.workspaceId IS NULL, profileId = Hustly).
 *
 * The workspace ROW was hard-deleted (no audit) overnight; because Task.workspaceId is
 * onDelete:SetNull, the tasks survived as orphans. This recreates the workspace exactly
 * like createWorkspaceAction (Workspace + WorkspaceMember OWNER) and re-links the tasks.
 *
 * SAFE: --dry-run by default (no writes). Aborts if an active "Tháng 6/2026" already
 * exists under Hustly. Re-link is scoped to (workspaceId IS NULL AND profileId = Hustly)
 * so it can ONLY touch Hustly's own orphans. Runs in one transaction.
 *
 *   npx tsx scripts/recover-hustly-june-workspace.ts --dry-run
 *   npx tsx scripts/recover-hustly-june-workspace.ts --apply
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const HUSTLY_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'
const WS_NAME = 'Tháng 6/2026'

async function main() {
    console.log(`=== Recover Hustly "${WS_NAME}" ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

    // Owner of Hustly (to set as WorkspaceMember OWNER, like createWorkspaceAction).
    const owner = await prisma.profileAccess.findFirst({
        where: { profileId: HUSTLY_ID, role: 'OWNER' },
        select: { userId: true, user: { select: { username: true } } },
    })
    if (!owner) { console.log('❌ No OWNER found for Hustly — abort.'); return }
    console.log(`Owner: ${owner.user?.username} (${owner.userId})`)

    // Idempotency: bail if an active June workspace already exists.
    const existing = await prisma.workspace.findFirst({
        where: { profileId: HUSTLY_ID, name: WS_NAME, status: { not: 'SOFT_DELETED' } as any },
        select: { id: true },
    })
    if (existing) { console.log(`⚠️  Active "${WS_NAME}" already exists (${existing.id}). Nothing to do.`); return }

    // Scope the orphans precisely.
    const scopedCount = await prisma.task.count({ where: { workspaceId: null, profileId: HUSTLY_ID } as any })
    const totalNull = await prisma.task.count({ where: { workspaceId: null } as any })
    const earliest = await prisma.task.findFirst({
        where: { workspaceId: null, profileId: HUSTLY_ID } as any,
        orderBy: { createdAt: 'asc' }, select: { createdAt: true },
    })
    const statusBreak = await prisma.$queryRawUnsafe<any[]>(
        `SELECT status, COUNT(*)::int AS n FROM "Task" WHERE "workspaceId" IS NULL AND "profileId"=$1 GROUP BY status ORDER BY n DESC`,
        HUSTLY_ID,
    )

    console.log(`\nOrphan tasks scoped to Hustly (workspaceId NULL AND profileId=Hustly): ${scopedCount}`)
    console.log(`Total orphan tasks system-wide (workspaceId NULL, any profile):       ${totalNull}`)
    console.log(`Earliest orphan task date (used as workspace.createdAt): ${earliest?.createdAt?.toISOString().slice(0,10) ?? '-'}`)
    console.log(`Status breakdown of the tasks to be recovered:`)
    for (const s of statusBreak) console.log(`   ${s.status}: ${s.n}`)

    if (scopedCount === 0) { console.log('\n❌ 0 scoped orphans — abort (would create an empty workspace).'); return }

    if (!APPLY) {
        console.log(`\n💡 DRY-RUN. With --apply: create workspace "${WS_NAME}" under Hustly (+ OWNER member),`)
        console.log(`   then re-link ${scopedCount} orphan tasks to it. Nothing written now.`)
        return
    }

    // APPLY — one transaction.
    const createdAt = earliest?.createdAt ?? new Date()
    const result = await prisma.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
            data: { name: WS_NAME, profileId: HUSTLY_ID, createdAt } as any,
        })
        await tx.workspaceMember.create({
            data: { userId: owner.userId, workspaceId: ws.id, role: 'OWNER' },
        })
        const relinked = await tx.task.updateMany({
            where: { workspaceId: null, profileId: HUSTLY_ID } as any,
            data: { workspaceId: ws.id },
        })
        return { wsId: ws.id, relinked: relinked.count }
    })

    console.log(`\n✅ Created workspace ${result.wsId} ("${WS_NAME}") and re-linked ${result.relinked} tasks.`)

    // Audit trail.
    const { audit } = await import('../src/lib/audit-log')
    await audit({
        workspaceId: result.wsId,
        actorUserId: owner.userId,
        action: 'workspace.created',
        targetType: 'Workspace',
        targetId: result.wsId,
        after: { name: WS_NAME, profileId: HUSTLY_ID, recoveredTasks: result.relinked, reason: 'recover-orphaned-june-workspace' },
    }).catch(() => {})

    // Verify.
    const check = await prisma.task.count({ where: { workspaceId: result.wsId } as any })
    const remainingOrphans = await prisma.task.count({ where: { workspaceId: null } as any })
    console.log(`Verify: workspace now has ${check} tasks. Remaining system-wide orphans: ${remainingOrphans}.`)
}

main().catch((e) => { console.error('recovery error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
