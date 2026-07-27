/**
 * One-off repair for the "delivered video is invisible in Tệp" bug.
 *
 * The code fix (reviveSystemFolderChain, src/lib/review/folders.ts) stops NEW uploads from
 * landing under a trashed ancestor, and self-heals a client folder the next time anyone
 * uploads for that client. It does NOT retro-actively rescue deliverables that are already
 * stranded — those stay invisible until someone happens to upload again. This script frees
 * them now.
 *
 * What it does: for every LIVE ReviewFolder/ReviewAsset whose materialized path passes
 * through a SOFT-DELETED folder, un-trash the folders on that ancestor chain (and only
 * those). Content the admin deliberately threw away stays in the trash.
 *
 * Byte rollups need no adjustment: addBytesToAncestors never filtered deletedAt, so uploads
 * made while the ancestor was trashed already propagated to the root. See the long comment
 * on reviveSystemFolderChain.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing:
 *   npx tsx scripts/repair-trashed-systemkey-folders.ts
 * Apply for real:
 *   npx tsx scripts/repair-trashed-systemkey-folders.ts --apply
 */
import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')

function pathIds(path: string): string[] {
    return path.split('/').filter(Boolean)
}

async function main() {
    console.log(APPLY ? '\n*** APPLY MODE — this WILL write ***\n' : '\n--- DRY RUN (no writes) ---\n')

    const trashedFolders = await prisma.reviewFolder.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, path: true, depth: true, parentId: true, deletedAt: true },
    })
    if (trashedFolders.length === 0) {
        console.log('No trashed folders at all. Nothing to do.')
        return
    }
    const trashedById = new Map(trashedFolders.map((f) => [f.id, f]))

    // Live rows stranded behind a trashed ancestor.
    const [liveFolders, liveAssets] = await Promise.all([
        prisma.reviewFolder.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, path: true },
        }),
        prisma.reviewAsset.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, taskId: true, folder: { select: { id: true, path: true } } },
        }),
    ])

    // Ancestors strictly ABOVE the row itself (a live row is never its own blocker).
    const blockers = new Set<string>()
    const strandedAssets: { name: string; taskId: string | null; via: string[] }[] = []

    for (const f of liveFolders) {
        for (const id of pathIds(f.path)) {
            if (id !== f.id && trashedById.has(id)) blockers.add(id)
        }
    }
    for (const a of liveAssets) {
        const via = pathIds(a.folder.path).filter((id) => id !== a.folder.id && trashedById.has(id))
        if (via.length) {
            via.forEach((id) => blockers.add(id))
            strandedAssets.push({ name: a.name, taskId: a.taskId, via: via.map((id) => trashedById.get(id)!.name) })
        }
    }

    if (blockers.size === 0) {
        console.log('No live content is stranded behind a trashed folder. Nothing to do.')
        return
    }

    // Reviving a blocker is pointless if ITS OWN ancestors are still trashed — pull the whole
    // chain up to the root.
    const toRevive = new Set<string>()
    for (const id of blockers) {
        const f = trashedById.get(id)!
        toRevive.add(id)
        for (const anc of pathIds(f.path)) if (anc !== id && trashedById.has(anc)) toRevive.add(anc)
    }

    console.log(`Stranded deliverables: ${strandedAssets.length}`)
    for (const a of strandedAssets) {
        console.log(`  • "${a.name}"  (task ${a.taskId ?? '-'})  blocked by: ${a.via.join(' → ')}`)
    }
    console.log(`\nFolders to un-trash: ${toRevive.size}`)
    const ordered = [...toRevive].map((id) => trashedById.get(id)!).sort((a, b) => a.depth - b.depth)
    for (const f of ordered) {
        console.log(`  • "${f.name}"  depth=${f.depth}  trashed ${f.deletedAt?.toISOString().slice(0, 10)}  id=${f.id}`)
    }

    if (!APPLY) {
        console.log('\nDry run complete. Re-run with --apply to perform the repair.')
        return
    }

    await prisma.$transaction(async (tx) => {
        for (const f of ordered) {
            await tx.reviewFolder.update({
                where: { id: f.id },
                data: { deletedAt: null, deletedById: null, deleteBatchId: null },
            })
            // Give the parent back the child `deleteItems` decremented, but only if the parent
            // is genuinely live now (never trashed, or revived earlier in this same loop).
            if (f.parentId) {
                const parentLive =
                    toRevive.has(f.parentId) ||
                    (await tx.reviewFolder.count({ where: { id: f.parentId, deletedAt: null } })) > 0
                if (parentLive) {
                    await tx.reviewFolder.update({ where: { id: f.parentId }, data: { itemCount: { increment: 1 } } })
                }
            }
        }
    })
    console.log(`\nDone. Un-trashed ${ordered.length} folder(s); ${strandedAssets.length} deliverable(s) are visible again.`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
