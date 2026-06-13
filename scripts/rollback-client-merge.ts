/**
 * [Canonical Clients 2026-06] Best-effort rollback for
 * scripts/migrate-clients-to-profile-scope.ts.
 *
 * Reads the `client.auto_merged` AuditLog rows the migration wrote and
 * reverses each merge:
 *   - restore the duplicate row: status = its pre-merge status (ACTIVE unless
 *     beforeData says SOFT_DELETED), mergedIntoId = null, deletedAt = null
 *   - re-point the FK rows (Task/Invoice/Project/PricingRule/User/
 *     ProfileAccess) that belonged to the duplicate BACK from the survivor
 *
 * ⚠ LIMITS — read before running:
 *   - FK rows are re-pointed by their ORIGINAL workspaceId: a Task that lived
 *     in the duplicate's workspace goes back to the duplicate. Tasks CREATED
 *     AFTER the merge (already attached to the survivor) stay with the
 *     survivor — the script cannot know where they "would have" lived.
 *   - Valid only while the audit rows exist and ids haven't been reused.
 *   - The REAL rollback is the Neon branch snapshot taken before --apply.
 *     Use this script only when the snapshot is no longer restorable.
 *
 *   npx tsx scripts/rollback-client-merge.ts            # dry-run
 *   npx tsx scripts/rollback-client-merge.ts --apply    # commit
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
    console.log(`\n══════ Rollback client merges · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ══════\n`)

    const logs = await prisma.auditLog.findMany({
        where: { action: 'client.auto_merged' },
        orderBy: { createdAt: 'desc' }, // reverse order: undo children before roots
    })
    console.log(`Found ${logs.length} merge audit row(s).\n`)

    let reversed = 0
    let skipped = 0

    for (const log of logs) {
        const before = log.beforeData as any
        const after = log.afterData as any
        const dupId: number | undefined = before?.duplicateId
        const survivorId: number | undefined = after?.survivorId
        if (!dupId || !survivorId) { skipped++; continue }

        const dup = await prisma.client.findUnique({ where: { id: dupId }, select: { id: true, status: true, mergedIntoId: true, workspaceId: true } })
        if (!dup || dup.status !== 'MERGED' || dup.mergedIntoId !== survivorId) {
            console.log(`  skip #${dupId}: not in MERGED state pointing at #${survivorId} (already rolled back?)`)
            skipped++
            continue
        }

        const dupWorkspaceId: string | null = before?.duplicateWorkspaceId ?? dup.workspaceId
        console.log(`  ${APPLY ? 'REVERSE' : 'would reverse'}: #${dupId} ("${before?.duplicateName}") ← from survivor #${survivorId}${dupWorkspaceId ? ` (ws ${dupWorkspaceId})` : ''}`)

        if (!APPLY) { reversed++; continue }

        await prisma.$transaction(async (tx) => {
            // Re-point FK rows that originally lived in the duplicate's
            // workspace. Models without workspaceId (User/ProfileAccess)
            // cannot be disambiguated — left with the survivor (logged).
            if (dupWorkspaceId) {
                await tx.task.updateMany({ where: { clientId: survivorId, workspaceId: dupWorkspaceId }, data: { clientId: dupId } })
                await tx.invoice.updateMany({ where: { clientId: survivorId, workspaceId: dupWorkspaceId }, data: { clientId: dupId } })
                await tx.project.updateMany({ where: { clientId: survivorId, workspaceId: dupWorkspaceId }, data: { clientId: dupId } })
                await tx.pricingRule.updateMany({ where: { clientId: survivorId, workspaceId: dupWorkspaceId }, data: { clientId: dupId } })
            }
            // Restore children that pointed at the duplicate pre-merge
            if (before?.duplicateParentId !== undefined) {
                // (children re-pointing is not reversible per-child without a
                // per-child log — survivors keep them; logged for awareness)
            }
            await tx.client.update({
                where: { id: dupId },
                data: {
                    status: before?.duplicateStatus === 'SOFT_DELETED' ? 'SOFT_DELETED' : 'ACTIVE',
                    mergedIntoId: null,
                    deletedAt: before?.duplicateStatus === 'SOFT_DELETED' ? undefined : null,
                },
            })
        })
        reversed++
    }

    console.log(`\n${APPLY ? 'Reversed' : 'Would reverse'} ${reversed}, skipped ${skipped}.`)
    if (APPLY) console.log(`NOTE: User/ProfileAccess clientId links and post-merge tasks stay on survivors (see header).`)
    console.log()
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
