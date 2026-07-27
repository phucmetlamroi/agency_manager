/**
 * One-off cleanup for the "1 video buried in its own folder" complaint (2026-07-27).
 *
 * The upload path now only creates a per-task video folder when a SET of files is dropped
 * (see ensureTaskFolderPath.groupInFolder). This script applies the same shape to what is
 * already on disk: every auto-created VIDEO folder that holds exactly one video and no
 * sub-folders gets flattened — the video moves up to the client/brand folder and the empty
 * wrapper is removed.
 *
 * Only touches folders the SYSTEM created (systemKey contains ':video:'). Folders a human
 * made by hand are never restructured, however few items they hold.
 *
 * Counters: no ancestor byte adjustment is needed. addBytesToAncestors propagated each
 * upload's bytes through the whole chain when it landed, so removing an intermediate level
 * leaves every ancestor total unchanged. The parent's itemCount is also unchanged — it loses
 * one folder and gains one asset.
 *
 * SKIPPED, never forced:
 *   - a folder referenced by a share link (ShareLinkItem → folder is onDelete: Cascade, so
 *     deleting it would silently break a link already sent to a client)
 *   - a name collision in the destination: ReviewAsset has
 *     UNIQUE ("folderId", lower("name")) WHERE "deletedAt" IS NULL, and two tasks for one
 *     client can parse to the same video name. Those get a " (2)" suffix rather than a crash.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing:
 *   npx tsx scripts/flatten-single-video-folders.ts
 * Apply for real:
 *   npx tsx scripts/flatten-single-video-folders.ts --apply
 */
import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')

interface Plan {
    folderId: string
    folderName: string
    parentId: string
    assetId: string
    assetName: string
    finalName: string
    workspaceId: string
}

async function main() {
    console.log(APPLY ? '\n*** APPLY MODE — this WILL write ***\n' : '\n--- DRY RUN (no writes) ---\n')

    // Auto-created per-task video folders that are still live.
    const videoFolders = await prisma.reviewFolder.findMany({
        where: { deletedAt: null, parentId: { not: null }, systemKey: { contains: ':video:' } },
        select: { id: true, name: true, parentId: true, workspaceId: true },
    })
    if (!videoFolders.length) {
        console.log('No auto-created video folders found. Nothing to do.')
        return
    }
    const ids = videoFolders.map((f) => f.id)

    const [childFolders, assets, shareItems] = await Promise.all([
        prisma.reviewFolder.findMany({
            where: { parentId: { in: ids }, deletedAt: null },
            select: { parentId: true },
        }),
        prisma.reviewAsset.findMany({
            where: { folderId: { in: ids }, deletedAt: null },
            select: { id: true, name: true, folderId: true },
        }),
        prisma.shareLinkItem.findMany({ where: { folderId: { in: ids } }, select: { folderId: true } }),
    ])

    const childCount = new Map<string, number>()
    for (const c of childFolders) if (c.parentId) childCount.set(c.parentId, (childCount.get(c.parentId) ?? 0) + 1)
    const assetsByFolder = new Map<string, typeof assets>()
    for (const a of assets) {
        const list = assetsByFolder.get(a.folderId) ?? []
        list.push(a)
        assetsByFolder.set(a.folderId, list)
    }
    const shared = new Set(shareItems.map((s) => s.folderId).filter((x): x is string => !!x))

    const plans: Plan[] = []
    const skipped: string[] = []

    // Names already live in each destination folder — so the suffix check sees siblings that
    // this run is about to add, not just what was there when it started.
    const destNames = new Map<string, Set<string>>()
    const parentIds = [...new Set(videoFolders.map((f) => f.parentId).filter((x): x is string => !!x))]
    const existingInParents = await prisma.reviewAsset.findMany({
        where: { folderId: { in: parentIds }, deletedAt: null },
        select: { folderId: true, name: true },
    })
    for (const a of existingInParents) {
        const set = destNames.get(a.folderId) ?? new Set<string>()
        set.add(a.name.toLowerCase())
        destNames.set(a.folderId, set)
    }

    for (const f of videoFolders) {
        if (!f.parentId) continue
        if (shared.has(f.id)) {
            skipped.push(`"${f.name}" — đang được chia sẻ qua link, giữ nguyên`)
            continue
        }
        if ((childCount.get(f.id) ?? 0) > 0) {
            skipped.push(`"${f.name}" — còn thư mục con`)
            continue
        }
        const inside = assetsByFolder.get(f.id) ?? []
        if (inside.length !== 1) {
            skipped.push(`"${f.name}" — chứa ${inside.length} video (chỉ gỡ khi đúng 1)`)
            continue
        }
        const asset = inside[0]
        const taken = destNames.get(f.parentId) ?? new Set<string>()
        let finalName = asset.name
        for (let n = 2; taken.has(finalName.toLowerCase()); n++) finalName = `${asset.name} (${n})`
        taken.add(finalName.toLowerCase())
        destNames.set(f.parentId, taken)
        plans.push({
            folderId: f.id,
            folderName: f.name,
            parentId: f.parentId,
            assetId: asset.id,
            assetName: asset.name,
            finalName,
            workspaceId: f.workspaceId,
        })
    }

    console.log(`Thư mục sẽ gỡ bỏ: ${plans.length}`)
    for (const p of plans) {
        const renamed = p.finalName !== p.assetName ? `  → đổi tên thành "${p.finalName}" (trùng tên ở thư mục đích)` : ''
        console.log(`  • "${p.folderName}" → thả video "${p.assetName}" lên thư mục cha${renamed}`)
    }
    if (skipped.length) {
        console.log(`\nBỏ qua: ${skipped.length}`)
        for (const s of skipped) console.log(`  • ${s}`)
    }

    if (!APPLY) {
        console.log('\nDry run xong. Chạy lại với --apply để thực hiện.')
        return
    }

    let done = 0
    for (const p of plans) {
        await prisma.$transaction(async (tx) => {
            await tx.reviewAsset.update({
                where: { id: p.assetId },
                data: { folderId: p.parentId, name: p.finalName },
            })
            // Safe now: ReviewAsset.folder is onDelete Restrict, and the folder is empty.
            await tx.reviewFolder.delete({ where: { id: p.folderId } })
        })
        done++
    }
    console.log(`\nXong. Đã gỡ ${done} thư mục bọc.`)
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
