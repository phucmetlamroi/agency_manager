// [Review module P6.2] Trash purge (FR-B13). Physically removes Mux assets, R2
// objects (originals + thumbs + comment attachments), and the DB rows for items
// that have sat in trash past the 30-day window. Runs BOTH from the nightly
// janitor sweep AND from the ADMIN "Delete forever" button — one core teardown.
//
// SAFETY — copy-on-reference ref-counting: P2.5 copy shares the source's
// muxPlaybackId + r2Key (the copy's muxAssetId is null due to the @unique). So a
// Mux asset / R2 object may still be referenced by a LIVE (deletedAt=null) copy.
// We NEVER delete an external object still referenced by a live version — we drop
// only the DB row and let the live copy keep serving. External deletes are
// idempotent (deleteObject/deleteMuxAsset swallow 404) so a crashed run re-runs
// cleanly; we always tear down EXTERNAL first, then delete rows (a row still
// pointing at its keys is safe to retry; an orphaned key is not recoverable).
//
// Cascade order (schema): ReviewVersion→asset Cascade, ReviewComment→version
// Cascade, CommentAttachment/Reaction→comment Cascade, ShareLinkItem→asset/folder
// Cascade, UploadSession→version Cascade; BUT ReviewAsset→folder and
// ReviewFolder→parent are Restrict → folders must be deleted deepest-first and
// only when they hold no live descendant (GAP-3: a restored child keeps its
// ancestor alive). ReviewActivity has NO FK → the audit trail outlives the purge.

import { prisma } from '@/lib/db'
import type { ReviewVersion } from '@prisma/client'
import { deleteObject } from './r2'
import { deleteMuxAsset } from './mux'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { reviewLog } from './logger'
import { requireReviewAccess } from './access'
import { apiError } from './errors'

const PURGE_AGE_DAYS = 30

export interface PurgeStats {
    versions: number
    assets: number
    folders: number
    muxDeleted: number
    r2Deleted: number
    attachmentsDeleted: number
    bytesFreed: bigint
}
const emptyStats = (): PurgeStats => ({ versions: 0, assets: 0, folders: 0, muxDeleted: 0, r2Deleted: 0, attachmentsDeleted: 0, bytesFreed: BigInt(0) })

/**
 * Tear down the EXTERNAL objects a version owns (Mux asset + R2 original/thumb +
 * comment-attachment R2 objects), ref-counting the shared keys against live
 * copies. Returns per-version counters. Does NOT delete DB rows.
 */
async function teardownVersionExternal(v: Pick<ReviewVersion, 'id' | 'r2Key' | 'thumbnailKey' | 'muxAssetId' | 'muxPlaybackId' | 'sizeBytes'>): Promise<PurgeStats> {
    const s = emptyStats()

    // Comment attachments are unique per comment (never shared) → always delete.
    const attachments = await prisma.commentAttachment.findMany({
        where: { comment: { versionId: v.id } },
        select: { r2Key: true },
    })
    for (const a of attachments) {
        try {
            await deleteObject(a.r2Key)
            s.attachmentsDeleted++
        } catch (e) {
            reviewLog('error', 'purge.attach_delete_failed', { key: a.r2Key.slice(0, 40), error: String(e) })
        }
    }

    // R2 original + thumb — only if no LIVE version still references the same key.
    if (v.r2Key) {
        const liveRef = await prisma.reviewVersion.count({ where: { r2Key: v.r2Key, deletedAt: null, id: { not: v.id } } })
        if (liveRef === 0) {
            try {
                await deleteObject(v.r2Key)
                s.r2Deleted++
                s.bytesFreed += v.sizeBytes ?? BigInt(0)
            } catch (e) {
                reviewLog('error', 'purge.r2_delete_failed', { versionId: v.id, error: String(e) })
            }
            if (v.thumbnailKey) await deleteObject(v.thumbnailKey).catch(() => {})
        }
    }

    // Mux asset — only the ORIGINAL version holds muxAssetId; but its playback id may
    // be shared by a live copy, so gate on the PLAYBACK id, not the asset id.
    if (v.muxAssetId && v.muxPlaybackId) {
        const liveRef = await prisma.reviewVersion.count({
            where: { muxPlaybackId: v.muxPlaybackId, deletedAt: null, id: { not: v.id } },
        })
        if (liveRef === 0) {
            try {
                await deleteMuxAsset(v.muxAssetId)
                s.muxDeleted++
            } catch (e) {
                reviewLog('error', 'purge.mux_delete_failed', { versionId: v.id, error: String(e) })
            }
        }
    }
    return s
}

function addStats(a: PurgeStats, b: PurgeStats): void {
    a.versions += b.versions
    a.assets += b.assets
    a.folders += b.folders
    a.muxDeleted += b.muxDeleted
    a.r2Deleted += b.r2Deleted
    a.attachmentsDeleted += b.attachmentsDeleted
    a.bytesFreed += b.bytesFreed
}

/**
 * Purge ONE asset: tear down every version's external objects, then delete the
 * asset row (cascades versions/comments/attachments/reactions/uploads/share-items).
 * Writes a trash.purged activity (FK-free → survives). `actorUserId` null = cron.
 */
async function purgeAssetById(assetId: string, kind: 'cron' | 'manual', actorUserId: string | null): Promise<PurgeStats> {
    const s = emptyStats()
    const asset = await prisma.reviewAsset.findUnique({
        where: { id: assetId },
        select: { id: true, name: true, workspaceId: true, taskId: true, folderId: true },
    })
    if (!asset) return s
    const versions = await prisma.reviewVersion.findMany({
        where: { assetId },
        select: { id: true, r2Key: true, thumbnailKey: true, muxAssetId: true, muxPlaybackId: true, sizeBytes: true },
    })
    for (const v of versions) {
        addStats(s, await teardownVersionExternal(v))
        s.versions++
    }
    // External is gone → now the rows. Cascade removes versions/comments/etc.
    await prisma.reviewAsset.delete({ where: { id: assetId } }).catch((e) => {
        reviewLog('error', 'purge.asset_row_delete_failed', { assetId, error: String(e) })
    })
    s.assets++
    await recordActivity(prisma, {
        type: REVIEW_ACTIVITY.TRASH_PURGED,
        workspaceId: asset.workspaceId,
        taskId: asset.taskId,
        assetId: asset.id,
        actorUserId,
        meta: { kind, itemName: asset.name, itemType: 'asset' },
    })
    return s
}

/** Purge ONE standalone version (single-version-in-stack delete whose asset is alive). */
async function purgeStandaloneVersion(versionId: string, actorUserId: string | null): Promise<PurgeStats> {
    const s = emptyStats()
    const v = await prisma.reviewVersion.findUnique({
        where: { id: versionId },
        select: { id: true, r2Key: true, thumbnailKey: true, muxAssetId: true, muxPlaybackId: true, sizeBytes: true, workspaceId: true, assetId: true },
    })
    if (!v) return s
    addStats(s, await teardownVersionExternal(v))
    await prisma.reviewVersion.delete({ where: { id: versionId } }).catch((e) => {
        reviewLog('error', 'purge.version_row_delete_failed', { versionId, error: String(e) })
    })
    s.versions++
    await recordActivity(prisma, {
        type: REVIEW_ACTIVITY.TRASH_PURGED,
        workspaceId: v.workspaceId,
        assetId: v.assetId,
        versionId,
        actorUserId,
        meta: { kind: 'version', itemType: 'version' },
    })
    return s
}

/** A folder is purgeable only when it has NO live descendant folder/asset (GAP-3). */
async function folderHasLiveDescendant(folderPath: string): Promise<boolean> {
    const [liveFolder, liveAsset] = await Promise.all([
        prisma.reviewFolder.count({ where: { path: { startsWith: folderPath }, deletedAt: null } }),
        prisma.reviewAsset.count({ where: { folder: { path: { startsWith: folderPath } }, deletedAt: null } }),
    ])
    return liveFolder > 0 || liveAsset > 0
}

// ─────────────────────────── nightly cron sweep ───────────────────────────

/**
 * Purge everything past the 30-day window, bounded to `batchSize` per category so
 * one run stays well under the function timeout (the next night drains the rest —
 * a hit cap is logged). Order: assets (cascade their versions) → standalone
 * versions → empty folders (deepest path first, skipping any with a live descendant).
 */
export async function purgeExpiredTrash(batchSize = 25): Promise<PurgeStats & { capHit: boolean }> {
    const cutoff = new Date(Date.now() - PURGE_AGE_DAYS * 24 * 60 * 60 * 1000)
    const total = emptyStats()
    let capHit = false

    const assets = await prisma.reviewAsset.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize,
    })
    for (const a of assets) addStats(total, await purgeAssetById(a.id, 'cron', null))
    if (assets.length === batchSize) capHit = true

    // Standalone versions whose asset is still alive (single-version delete).
    const versions = await prisma.reviewVersion.findMany({
        where: { deletedAt: { lt: cutoff }, asset: { deletedAt: null } },
        select: { id: true },
        take: batchSize,
    })
    for (const v of versions) addStats(total, await purgeStandaloneVersion(v.id, null))
    if (versions.length === batchSize) capHit = true

    // Empty folders, deepest-first (longest path = deepest) so children go before parents.
    const folders = await prisma.reviewFolder.findMany({
        where: { deletedAt: { lt: cutoff } },
        select: { id: true, path: true, name: true, workspaceId: true },
        orderBy: { path: 'desc' },
        take: batchSize,
    })
    for (const f of folders) {
        if (await folderHasLiveDescendant(f.path)) continue // GAP-3: a restored child keeps it
        await prisma.reviewFolder.delete({ where: { id: f.id } }).catch((e) =>
            reviewLog('error', 'purge.folder_row_delete_failed', { folderId: f.id, error: String(e) }),
        )
        total.folders++
        await recordActivity(prisma, {
            type: REVIEW_ACTIVITY.TRASH_PURGED,
            workspaceId: f.workspaceId,
            folderId: f.id,
            actorUserId: null,
            meta: { kind: 'cron', itemName: f.name, itemType: 'folder' },
        })
    }
    if (folders.length === batchSize) capHit = true

    reviewLog('info', 'purge.summary', {
        versions: total.versions,
        assets: total.assets,
        folders: total.folders,
        muxDeleted: total.muxDeleted,
        r2Deleted: total.r2Deleted,
        bytesFreed: total.bytesFreed.toString(),
        capHit,
    })
    return { ...total, capHit }
}

// ─────────────────────────── manual "Delete forever" (ADMIN) ───────────────────────────

export interface PurgeItemRef {
    type: 'folder' | 'asset'
    id: string
}

/**
 * ADMIN-only immediate purge of the given trash items (each = a batch root in the
 * Recently Deleted UI). Runs the SAME teardown as the cron; for a folder root it
 * purges the whole subtree (assets deepest-first, then folders). Bypasses the
 * 30-day age — the admin explicitly asked. Guarded to ADMIN of the workspace by
 * the caller (route), re-verified here.
 */
export async function manualPurgeItems(
    input: { items: PurgeItemRef[] },
    ctx: { workspaceId: string; userId: string; isAdmin: boolean },
): Promise<PurgeStats> {
    const total = emptyStats()

    for (const item of input.items) {
        if (item.type === 'asset') {
            const asset = await prisma.reviewAsset.findFirst({
                where: { id: item.id, workspaceId: ctx.workspaceId, deletedAt: { not: null } },
                select: { id: true },
            })
            if (asset) addStats(total, await purgeAssetById(asset.id, 'manual', ctx.userId))
            continue
        }
        // Folder root → purge its whole deleted subtree: assets first, then folders deepest-first.
        const folder = await prisma.reviewFolder.findFirst({
            where: { id: item.id, workspaceId: ctx.workspaceId, deletedAt: { not: null } },
            select: { id: true, path: true, name: true, workspaceId: true },
        })
        if (!folder) continue
        const subAssets = await prisma.reviewAsset.findMany({
            where: { folder: { path: { startsWith: folder.path } }, deletedAt: { not: null } },
            select: { id: true },
        })
        for (const a of subAssets) addStats(total, await purgeAssetById(a.id, 'manual', ctx.userId))
        const subFolders = await prisma.reviewFolder.findMany({
            where: { path: { startsWith: folder.path }, deletedAt: { not: null } },
            select: { id: true, path: true, name: true, workspaceId: true },
            orderBy: { path: 'desc' },
        })
        for (const f of subFolders) {
            if (await folderHasLiveDescendant(f.path)) continue
            await prisma.reviewFolder.delete({ where: { id: f.id } }).catch(() => {})
            total.folders++
        }
        await recordActivity(prisma, {
            type: REVIEW_ACTIVITY.TRASH_PURGED,
            workspaceId: folder.workspaceId,
            folderId: folder.id,
            actorUserId: ctx.userId,
            meta: { kind: 'manual', itemName: folder.name, itemType: 'folder' },
        })
    }
    reviewLog('info', 'purge.manual', {
        userId: ctx.userId,
        items: input.items.length,
        assets: total.assets,
        folders: total.folders,
        muxDeleted: total.muxDeleted,
        r2Deleted: total.r2Deleted,
    })
    return total
}

/**
 * Route-facing "Delete forever": resolves the workspace from the first item,
 * requires WORKSPACE-scoped ADMIN (not the global JWT role — same lesson as
 * deleteShare in P5), then runs the manual purge. All items must be trashed +
 * same workspace.
 */
export async function purgeItemsAuthorized(input: { items: PurgeItemRef[] }): Promise<{
    versions: number
    assets: number
    folders: number
    bytesFreed: string
}> {
    if (!input.items.length || input.items.length > 200) {
        throw apiError(400, 'VALIDATION_ERROR', 'Số mục phải từ 1–200.')
    }
    const first = input.items[0]
    const row =
        first.type === 'asset'
            ? await prisma.reviewAsset.findFirst({ where: { id: first.id, deletedAt: { not: null } }, select: { workspaceId: true } })
            : await prisma.reviewFolder.findFirst({ where: { id: first.id, deletedAt: { not: null } }, select: { workspaceId: true } })
    if (!row) throw apiError(404, 'NOT_IN_TRASH', 'Mục không nằm trong thùng rác.')
    const workspaceId = row.workspaceId

    const access = await requireReviewAccess({ workspaceId })
    if (!access.isAdmin) {
        throw apiError(403, 'FORBIDDEN', 'Chỉ admin mới xóa vĩnh viễn được.')
    }
    const stats = await manualPurgeItems(input, { workspaceId, userId: access.userId, isAdmin: true })
    return { versions: stats.versions, assets: stats.assets, folders: stats.folders, bytesFreed: stats.bytesFreed.toString() }
}
