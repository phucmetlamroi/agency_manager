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
 *   - a folder that does not hold exactly one live video, or that has sub-folders
 *
 * RUNS AGAINST A LIVE DATABASE people are uploading to, so:
 *   - the plan is re-verified INSIDE each transaction. A folder that gained a second video
 *     between planning and writing is skipped, not flattened.
 *   - the destination name is chosen inside that same transaction, because ReviewAsset has
 *     UNIQUE ("folderId", lower("name")) WHERE "deletedAt" IS NULL and a concurrent upload
 *     can take the name a pre-computed map thought was free.
 *   - one transaction per folder, and a failure is recorded and skipped rather than
 *     aborting the run. ReviewAsset.folder is onDelete: Restrict, so a folder that just
 *     received an upload refuses to be deleted instead of orphaning it.
 *
 * Every DB call carries BOTH a server-side statement_timeout and a client-side deadline.
 * The server timeout alone is not enough: the failure that stalled three earlier runs for
 * 76 minutes was a Neon connection that accepted the query and never answered, which no
 * amount of statement_timeout can interrupt.
 *
 * Re-running is safe. Flattened folders no longer match the plan query, so a second run
 * simply picks up whatever the first one skipped.
 *
 * DRY RUN BY DEFAULT — prints the plan and writes nothing:
 *   npx tsx scripts/flatten-single-video-folders.ts
 * Apply for real:
 *   npx tsx scripts/flatten-single-video-folders.ts --apply
 */
import { appendFileSync } from 'fs'
import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')
// Appended to after EACH successful folder, not dumped once up front. Deleting a folder row
// is not reversible from the DB alone, and a run that dies halfway must still leave an
// accurate record of what actually happened — not what was merely planned.
const ROLLBACK_LOG = 'scripts/.flatten-rollback.jsonl'
const DEADLINE_MS = 30_000
const RETRIES = 3

interface Row {
    id: string
    name: string
    parentId: string
    workspaceId: string
    n_children: number
    n_shares: number
    n_assets: number
    asset_id: string | null
    asset_name: string | null
}

/** Client-side deadline. Guards the failure mode statement_timeout cannot: a connection that
 *  swallows the query and never replies, leaving the driver waiting forever. */
function deadline<T>(label: string, p: Promise<T>, ms = DEADLINE_MS): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`TIMEOUT sau ${ms}ms: ${label}`)), ms)
        p.then(
            (v) => {
                clearTimeout(timer)
                resolve(v)
            },
            (e) => {
                clearTimeout(timer)
                reject(e)
            },
        )
    })
}

/** Retries exist for the flaky connection, not for the database saying no. A constraint
 *  violation returns the same answer every time, so it fails on the first attempt. */
function isDeterministic(e: unknown): boolean {
    const code = (e as { code?: string })?.code
    return typeof code === 'string' && code.startsWith('P2')
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let last: unknown
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            return await deadline(label, fn())
        } catch (e) {
            last = e
            if (isDeterministic(e)) throw e
            const msg = e instanceof Error ? e.message : String(e)
            console.log(`  ! ${label} lần ${attempt}/${RETRIES} lỗi: ${msg}`)
            if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 2000 * attempt))
        }
    }
    throw last
}

/** The whole plan in ONE round trip. The previous version issued four separate queries and
 *  hung on the second; there is nothing here that needs more than one. */
async function loadPlan(): Promise<Row[]> {
    return withRetry('quét kế hoạch', () =>
        prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`)
            return tx.$queryRawUnsafe<Row[]>(`
                SELECT f.id, f.name, f."parentId", f."workspaceId",
                       (SELECT count(*) FROM "ReviewFolder" c
                         WHERE c."parentId" = f.id AND c."deletedAt" IS NULL)::int AS n_children,
                       (SELECT count(*) FROM "ShareLinkItem" s WHERE s."folderId" = f.id)::int AS n_shares,
                       (SELECT count(*) FROM "ReviewAsset" a
                         WHERE a."folderId" = f.id AND a."deletedAt" IS NULL)::int AS n_assets,
                       (SELECT a.id FROM "ReviewAsset" a
                         WHERE a."folderId" = f.id AND a."deletedAt" IS NULL LIMIT 1) AS asset_id,
                       (SELECT a.name FROM "ReviewAsset" a
                         WHERE a."folderId" = f.id AND a."deletedAt" IS NULL LIMIT 1) AS asset_name
                FROM "ReviewFolder" f
                WHERE f."deletedAt" IS NULL
                  AND f."parentId" IS NOT NULL
                  AND f."systemKey" LIKE '%:video:%'
                ORDER BY f.name
            `)
        }),
    )
}

/** Move the one video up and drop the wrapper — re-checking every precondition inside the
 *  transaction, because the plan was read while people were still uploading. */
async function flattenOne(row: Row): Promise<'done' | 'skipped' | 'failed'> {
    const finalName = await prisma
        .$transaction(
            async (tx) => {
                await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '20s'`)

                // Re-verify against NOW, not against the plan.
                const folder = await tx.reviewFolder.findFirst({
                    where: { id: row.id, deletedAt: null },
                    select: { id: true, parentId: true },
                })
                if (!folder?.parentId) throw new SkipError('thư mục đã biến mất hoặc đã lên gốc')

                // Trashed rows count too. ReviewFolder.parent is onDelete: Restrict and the FK does
                // not know about deletedAt, so a soft-deleted child still pins the folder in place.
                // Lifting a trashed sub-tree would mean recomputing its whole materialized path, so
                // these folders are left alone rather than half-migrated.
                const children = await tx.reviewFolder.count({ where: { parentId: row.id } })
                if (children > 0) throw new SkipError('còn thư mục con (kể cả trong thùng rác)')

                const shares = await tx.shareLinkItem.count({ where: { folderId: row.id } })
                if (shares > 0) throw new SkipError('vừa được gắn vào link chia sẻ')

                const assets = await tx.reviewAsset.findMany({
                    where: { folderId: row.id, deletedAt: null },
                    select: { id: true, name: true },
                })
                if (assets.length !== 1) throw new SkipError(`đang chứa ${assets.length} video (chỉ gỡ khi đúng 1)`)
                const asset = assets[0]

                // Pick a free name here, inside the transaction, against the live sibling set.
                const siblings = await tx.reviewAsset.findMany({
                    where: { folderId: folder.parentId, deletedAt: null },
                    select: { name: true },
                })
                const taken = new Set(siblings.map((s) => s.name.toLowerCase()))
                let name = asset.name
                for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${asset.name} (${n})`

                await tx.reviewAsset.update({
                    where: { id: asset.id },
                    data: { folderId: folder.parentId, name },
                })

                // Videos already in the trash still carry folderId, and ReviewAsset.folder is
                // onDelete: Restrict — leaving them behind makes the delete below fail outright.
                // They ride up to the parent with the live one, so restoring them later lands them
                // where their sibling now is. No rename needed: the uniqueness index is partial
                // (WHERE "deletedAt" IS NULL), so trashed names cannot collide.
                const lifted = await tx.reviewAsset.updateMany({
                    where: { folderId: row.id, deletedAt: { not: null } },
                    data: { folderId: folder.parentId },
                })

                // Safe now: nothing references the folder any more.
                await tx.reviewFolder.delete({ where: { id: row.id } })

                appendFileSync(
                    ROLLBACK_LOG,
                    JSON.stringify({
                        folderId: row.id,
                        folderName: row.name,
                        parentId: folder.parentId,
                        workspaceId: row.workspaceId,
                        assetId: asset.id,
                        nameBefore: asset.name,
                        nameAfter: name,
                        trashedAssetsLifted: lifted.count,
                    }) + '\n',
                    'utf8',
                )
                return name
            },
            { timeout: 25_000 },
        )
        .catch((e: unknown) => {
            if (e instanceof SkipError) {
                console.log(`  ↷ "${row.name}" — ${e.message}`)
                return null
            }
            throw e
        })

    if (finalName === null) return 'skipped'
    const renamed = finalName !== row.asset_name ? ` → đổi tên thành "${finalName}"` : ''
    console.log(`  ✓ "${row.name}" — video đã lên thư mục cha${renamed}`)
    return 'done'
}

class SkipError extends Error {}

async function main() {
    console.log(APPLY ? '\n*** APPLY MODE — this WILL write ***\n' : '\n--- DRY RUN (no writes) ---\n')

    const rows = await loadPlan()
    if (!rows.length) {
        console.log('No auto-created video folders found. Nothing to do.')
        return
    }

    const plans: Row[] = []
    const skipped: string[] = []
    for (const r of rows) {
        if (r.n_shares > 0) skipped.push(`"${r.name}" — đang được chia sẻ qua link, giữ nguyên`)
        else if (r.n_children > 0) skipped.push(`"${r.name}" — còn thư mục con`)
        else if (r.n_assets !== 1 || !r.asset_id) skipped.push(`"${r.name}" — chứa ${r.n_assets} video (chỉ gỡ khi đúng 1)`)
        else plans.push(r)
    }

    console.log(`Tổng thư mục bọc đang sống: ${rows.length}`)
    console.log(`Thư mục sẽ gỡ bỏ: ${plans.length}`)
    for (const p of plans) console.log(`  • "${p.name}" → thả video "${p.asset_name}" lên thư mục cha`)
    if (skipped.length) {
        console.log(`\nBỏ qua: ${skipped.length}`)
        for (const s of skipped) console.log(`  • ${s}`)
    }

    if (!APPLY) {
        console.log('\nDry run xong. Chạy lại với --apply để thực hiện.')
        return
    }

    console.log(`\nBắt đầu ghi. Nhật ký hoàn tác: ${ROLLBACK_LOG}\n`)
    let done = 0
    let skip = 0
    const failed: string[] = []
    for (const [i, p] of plans.entries()) {
        process.stdout.write(`[${i + 1}/${plans.length}] `)
        try {
            const r = await withRetry(`gỡ "${p.name}"`, () => flattenOne(p))
            if (r === 'done') done++
            else skip++
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            failed.push(`"${p.name}": ${msg}`)
            console.log(`  ✗ "${p.name}" — bỏ qua sau ${RETRIES} lần thử: ${msg}`)
        }
    }

    console.log(`\nXong. Đã gỡ ${done} thư mục bọc, bỏ qua ${skip}, lỗi ${failed.length}.`)
    if (failed.length) {
        console.log('Các mục lỗi (chạy lại script sẽ thử lại chúng):')
        for (const f of failed) console.log(`  • ${f}`)
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
