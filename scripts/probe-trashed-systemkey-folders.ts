/**
 * READ-ONLY diagnostic for the "uploaded deliverable is invisible in Tệp" bug.
 *
 * Hypothesis under test: ReviewFolder.systemKey is @unique, but every find-or-create
 * path (task-folder.ts ensureFolder, upload-service.ts ensureRootFolder,
 * folders.ts ensureWorkspaceRoot) resolves it WITHOUT a `deletedAt: null` filter.
 * So once a system folder is trashed, its key is squatted forever and every later
 * task upload re-parents live content underneath a soft-deleted ancestor — which
 * every listing filters out, making the delivered video unreachable from the tree.
 *
 * Contains SELECTs only. No writes of any kind.
 *   npx tsx scripts/probe-trashed-systemkey-folders.ts
 */
import { prisma } from '../src/lib/db'

async function main() {
    const trashed = await prisma.reviewFolder.findMany({
        where: { systemKey: { not: null }, deletedAt: { not: null } },
        select: {
            id: true,
            name: true,
            path: true,
            depth: true,
            systemKey: true,
            deletedAt: true,
            workspaceId: true,
        },
        orderBy: { deletedAt: 'asc' },
    })

    // ReviewFolder.workspaceId is a scalar FK (no relation) — resolve names separately.
    const wsRows = await prisma.workspace.findMany({
        where: { id: { in: [...new Set(trashed.map((f) => f.workspaceId))] } },
        select: { id: true, name: true },
    })
    const wsName = new Map(wsRows.map((w) => [w.id, w.name]))

    console.log(`\n=== Trashed folders holding a systemKey: ${trashed.length} ===`)

    let squattedWithLiveContent = 0
    for (const f of trashed) {
        // Live descendants = content the UI can never reach from the tree.
        const [liveFolders, liveAssets] = await Promise.all([
            prisma.reviewFolder.count({
                where: { path: { startsWith: f.path }, id: { not: f.id }, deletedAt: null },
            }),
            prisma.reviewAsset.count({
                where: { folder: { path: { startsWith: f.path } }, deletedAt: null },
            }),
        ])
        const orphaned = liveFolders > 0 || liveAssets > 0
        if (orphaned) squattedWithLiveContent++
        console.log(
            [
                orphaned ? 'ORPHANS ' : '        ',
                `ws=${(f.workspace?.name ?? '?').padEnd(12).slice(0, 12)}`,
                `name=${f.name.padEnd(22).slice(0, 22)}`,
                `depth=${f.depth}`,
                `liveChildFolders=${liveFolders}`,
                `liveAssets=${liveAssets}`,
                `deletedAt=${f.deletedAt?.toISOString().slice(0, 19)}`,
                `id=${f.id}`,
            ].join(' '),
        )
    }

    console.log(`\n=== Trashed system folders that still hold LIVE content: ${squattedWithLiveContent} ===`)

    // Every live asset whose folder chain passes through a trashed folder = a
    // deliverable that exists but cannot be found by navigating the Files tree.
    const liveAssets = await prisma.reviewAsset.findMany({
        where: { deletedAt: null },
        select: {
            id: true,
            name: true,
            taskId: true,
            folder: { select: { id: true, path: true, name: true } },
        },
    })
    const trashedIds = new Set(
        (
            await prisma.reviewFolder.findMany({
                where: { deletedAt: { not: null } },
                select: { id: true },
            })
        ).map((r) => r.id),
    )
    const unreachable = liveAssets.filter((a) =>
        a.folder.path
            .split('/')
            .filter(Boolean)
            .some((id) => id !== a.folder.id && trashedIds.has(id)),
    )
    console.log(`\n=== LIVE assets stranded under a trashed ancestor: ${unreachable.length} ===`)
    for (const a of unreachable) {
        console.log(`  asset="${a.name}" folder="${a.folder.name}" taskId=${a.taskId ?? '-'} assetId=${a.id}`)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
