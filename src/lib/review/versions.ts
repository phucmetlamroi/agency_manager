// [Review module P3.1] Version-stack mutations (PRD nhóm C, DATA-MODEL §4.2–4.3 + §8).
// A ReviewAsset is a flat, append-only stack of ReviewVersions. Comments are bound to a
// versionId (NOT the asset), so a version physically MOVING between stacks carries its
// comments for free. Locked invariants enforced here:
//   I1  versionNumber is append-only, never reused/reordered; max+1 counts DELETED rows too.
//   I3  currentVersionId ALWAYS points to the live version with the highest versionNumber —
//       re-pointed in the SAME transaction as every add/remove/delete.
//   I2  a live stack never has zero live versions → deleting the last one deletes the stack.
// Every entry point re-derives the workspace from the resolved row → requireReviewAccess
// (defense in depth). No finance fields exist on these models.

import { prisma } from '@/lib/db'
import { Prisma, ReviewPipelineStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import { requireReviewAccess, ReviewAccessError } from './access'
import { getFolderScope, assertAssetInScope } from './folder-scope'
import { apiError } from './errors'
import { pathIds, addBytesToAncestors } from './folders'
import { serializeVersion, toUserRef, type VersionDto, type UserRef } from './dto'
import { buildMediaLinks } from './media-links'
import { recordActivity, REVIEW_ACTIVITY } from './activity'

const NOT_TERMINAL: ReviewPipelineStatus[] = [
    ReviewPipelineStatus.UPLOADING,
    ReviewPipelineStatus.UPLOADED,
    ReviewPipelineStatus.PROCESSING,
]

/** Name for a version split into its own stack: the card-name convention (filename w/o ext). */
function versionCardName(fileName: string): string {
    const dot = fileName.lastIndexOf('.')
    const base = dot > 0 ? fileName.slice(0, dot) : fileName
    return base.trim() || fileName
}

async function loadUserRefs(userIds: (string | null | undefined)[]): Promise<Map<string, UserRef>> {
    const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)))
    if (ids.length === 0) return new Map()
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
    })
    const map = new Map<string, UserRef>()
    for (const u of users) {
        const ref = toUserRef(u)
        if (ref) map.set(u.id, ref)
    }
    return map
}

// ─────────────────────────── list (Manage Versions modal) ───────────────────────────

export interface VersionRowDto extends VersionDto {
    isCurrent: boolean
}
export interface ListVersionsResult {
    asset: {
        id: string
        name: string
        mediaKind: 'video' | 'image'
        currentVersionId: string | null
        folderId: string
        // [P3-B] task context so the player can gate the F8/F9/F10 staff actions by
        // status + role. Null when the asset isn't attached to a task (Team-only).
        taskId: string | null
        taskStatus: string | null
        assigneeId: string | null
    }
    versions: VersionRowDto[]
}

export async function listVersions(assetId: string): Promise<ListVersionsResult> {
    const asset = await prisma.reviewAsset.findFirst({ where: { id: assetId, deletedAt: null } })
    // [kiểm toán 2026-07 · §11] Cùng lỗi và cùng cách chữa như listChildren: id không tồn tại
    // và id có thật ở workspace khác phải trả lời Y HỆT NHAU, nếu không endpoint này thành
    // phép thử "asset này có thật không". Xem chú thích dài ở folders.ts (listChildren).
    const hidden = () => apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    if (!asset) {
        await requireReviewAccess()
        throw hidden()
    }
    let access
    try {
        access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    } catch (e) {
        if (e instanceof ReviewAccessError && e.status === 401) throw e
        throw hidden()
    }
    // [FR-03] editor chỉ xem version của asset trong phạm vi được giao.
    await assertAssetInScope(await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }), asset.id, 'read')

    const versions = await prisma.reviewVersion.findMany({
        where: { assetId, deletedAt: null },
        orderBy: { versionNumber: 'desc' }, // newest → oldest (FR-C02)
    })
    const refs = await loadUserRefs(versions.map((v) => v.uploaderId))
    // [P3-B] Task context for the player's F8/F9/F10 gating. Same-workspace scope for defense.
    const task = asset.taskId
        ? await prisma.task.findFirst({
              where: { id: asset.taskId, workspaceId: asset.workspaceId },
              select: { status: true, assigneeId: true },
          })
        : null
    return {
        asset: {
            id: asset.id,
            name: asset.name,
            mediaKind: asset.mediaKind === 'VIDEO' ? 'video' : 'image',
            currentVersionId: asset.currentVersionId,
            folderId: asset.folderId,
            taskId: asset.taskId,
            taskStatus: task?.status ?? null,
            assigneeId: task?.assigneeId ?? null,
        },
        versions: versions.map((v) => ({
            ...serializeVersion(v, {
                uploader: v.uploaderId ? refs.get(v.uploaderId) ?? null : null,
                media: buildMediaLinks({ muxPlaybackId: v.muxPlaybackId, thumbTime: v.thumbTime }),
            }),
            isCurrent: v.id === asset.currentVersionId,
        })),
    }
}

// ─────────────────────────── helpers ───────────────────────────

/** Highest LIVE versionNumber in a stack (null if none) — the head after a mutation. */
async function highestLiveVersion(
    tx: Prisma.TransactionClient,
    assetId: string,
    excludeVersionId?: string,
): Promise<{ id: string; versionNumber: number } | null> {
    const v = await tx.reviewVersion.findFirst({
        where: { assetId, deletedAt: null, ...(excludeVersionId ? { id: { not: excludeVersionId } } : {}) },
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true },
    })
    return v
}

// ─────────────────────────── delete one version ───────────────────────────

/**
 * Soft-delete ONE version. If it's the only live version, the whole stack is trashed
 * (I2 — never a live stack with 0 live versions). If it was the head, currentVersionId
 * re-points to the next-highest live version (I3). Remaining numbers are NOT renumbered.
 */
export async function deleteVersion(
    versionId: string,
): Promise<{ stackDeleted: boolean; assetId: string; currentVersionId: string | null }> {
    const version = await prisma.reviewVersion.findFirst({ where: { id: versionId, deletedAt: null } })
    if (!version) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phiên bản.')
    const asset = await prisma.reviewAsset.findFirst({ where: { id: version.assetId, deletedAt: null } })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    // [FR-03] editor chỉ xóa version của asset trong phạm vi được giao.
    await assertAssetInScope(await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }), asset.id, 'write')

    const now = new Date()

    return prisma.$transaction(async (tx) => {
        // [K1] Serialize deletes on the SAME asset: reading liveCount + the head pointer OUTSIDE the
        // tx let two racers both observe liveCount=2, both take the non-last branch, and strand a live
        // asset with 0 live versions (violates I2). Lock, then read liveCount/head INSIDE the tx so a
        // second concurrent delete correctly sees liveCount=1 and trashes the whole stack instead.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${asset.id}, 0))`
        const stillLive = await tx.reviewVersion.findFirst({ where: { id: versionId, deletedAt: null }, select: { id: true } })
        if (!stillLive) throw apiError(409, 'STATE_INVALID', 'Phiên bản đã bị xóa.', { reason: 'already_deleted' })
        const liveCount = await tx.reviewVersion.count({ where: { assetId: asset.id, deletedAt: null } })
        const current = await tx.reviewAsset.findUnique({ where: { id: asset.id }, select: { currentVersionId: true } })
        const folder = await tx.reviewFolder.findUnique({ where: { id: asset.folderId }, select: { path: true } })

        if (liveCount <= 1) {
            // Last live version → trash the whole stack (asset + this version) as one batch.
            const batchId = randomUUID()
            const del = { deletedAt: now, deletedById: access.userId, deleteBatchId: batchId }
            await tx.reviewVersion.update({ where: { id: versionId }, data: del })
            await tx.reviewAsset.update({ where: { id: asset.id }, data: del })
            await tx.reviewFolder.update({ where: { id: asset.folderId }, data: { itemCount: { decrement: 1 } } })
            if (folder) await addBytesToAncestors(tx, pathIds(folder.path), -version.sizeBytes)
            await recordActivity(tx, {
                type: REVIEW_ACTIVITY.VERSION_DELETED,
                workspaceId: asset.workspaceId,
                assetId: asset.id,
                versionId,
                actorUserId: access.userId,
                meta: { versionNumber: version.versionNumber, stackDeleted: true },
            })
            return { stackDeleted: true, assetId: asset.id, currentVersionId: null }
        }

        // Soft-delete just this version; re-point head if it was current.
        //
        // [audit 2026-07-27 · HIGH] deleteBatchId is NOT optional here. Restore clears rows by
        // batch id (restoreItems), so a version soft-deleted without one could never be un-deleted
        // by any code path — while purgeExpiredTrash specifically hunts this exact shape
        // (`deletedAt < cutoff AND asset.deletedAt IS NULL`) and destroys the Mux asset and the R2
        // original at day 30. And this is the ONLY delete branch a user can actually reach:
        // ManageVersionsModal hides both version actions behind `{!single && …}`, so every
        // "Xóa phiên bản" a human clicks landed here — on a silent, permanent delete, under a
        // dialog promising "khôi phục được trong 30 ngày".
        const batchId = randomUUID()
        await tx.reviewVersion.update({
            where: { id: versionId },
            data: { deletedAt: now, deletedById: access.userId, deleteBatchId: batchId },
        })
        let currentVersionId = current?.currentVersionId ?? null
        if (current?.currentVersionId === versionId) {
            const head = await highestLiveVersion(tx, asset.id, versionId)
            currentVersionId = head?.id ?? null
            await tx.reviewAsset.update({ where: { id: asset.id }, data: { currentVersionId } })
        }
        // The stack lost this version's bytes from the folder rollup.
        if (folder) await addBytesToAncestors(tx, pathIds(folder.path), -version.sizeBytes)
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.VERSION_DELETED,
            workspaceId: asset.workspaceId,
            assetId: asset.id,
            versionId,
            actorUserId: access.userId,
            meta: { versionNumber: version.versionNumber, stackDeleted: false },
        })
        return { stackDeleted: false, assetId: asset.id, currentVersionId }
    })
}

// ─────────────────────────── remove from stack ───────────────────────────

/**
 * Split ONE version out into a NEW standalone asset in the SAME folder (FR-C03). Its
 * comments/annotations/resolve-state follow (they key off versionId, which is unchanged).
 * Remaining versions KEEP their numbers (gaps OK). currentVersionId re-points if the
 * removed version was the head. Bytes stay in the same folder → only itemCount +1.
 */
export async function removeFromStack(versionId: string): Promise<{ newAssetId: string; assetId: string }> {
    const version = await prisma.reviewVersion.findFirst({ where: { id: versionId, deletedAt: null } })
    if (!version) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phiên bản.')
    const asset = await prisma.reviewAsset.findFirst({ where: { id: version.assetId, deletedAt: null } })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })
    // [FR-03] editor chỉ tách version của asset trong phạm vi được giao.
    await assertAssetInScope(await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }), asset.id, 'write')

    return prisma.$transaction(async (tx) => {
        // [K1] Lock the asset + read liveCount INSIDE the tx: two concurrent detaches of different
        // versions of a 2-version stack would both pass a pre-tx liveCount>1 check and each split one
        // out, leaving the source asset live with 0 versions (violates I2).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${asset.id}, 0))`
        const stillLive = await tx.reviewVersion.findFirst({ where: { id: versionId, deletedAt: null }, select: { id: true } })
        if (!stillLive) throw apiError(409, 'STATE_INVALID', 'Phiên bản đã bị xóa.', { reason: 'already_deleted' })
        const liveCount = await tx.reviewVersion.count({ where: { assetId: asset.id, deletedAt: null } })
        if (liveCount <= 1) {
            throw apiError(400, 'STATE_INVALID', 'Không thể tách phiên bản cuối cùng — hãy dùng Xóa asset.', { reason: 'last_version' })
        }
        const current = await tx.reviewAsset.findUnique({ where: { id: asset.id }, select: { currentVersionId: true } })
        const newAssetId = randomUUID()
        // New standalone asset, same folder; head = the moved version.
        await tx.reviewAsset.create({
            data: {
                id: newAssetId,
                folderId: asset.folderId,
                workspaceId: asset.workspaceId,
                name: versionCardName(version.fileName),
                mediaKind: version.mediaKind,
                createdById: access.userId,
                currentVersionId: null, // set after the version is re-parented (FK ordering)
            },
        })
        await tx.reviewVersion.update({ where: { id: versionId }, data: { assetId: newAssetId } })

        // Old stack: RELEASE/re-point its head FIRST if we removed the current version, so the
        // @unique currentVersionId slot is freed BEFORE the new asset claims `versionId`. If we
        // claimed on the new asset first, the old row would momentarily still hold `versionId`
        // → two rows share the same non-null currentVersionId → Postgres P2002 → the generic
        // "Lỗi hệ thống" the user hit when detaching the TOP/current version. versionId has
        // already moved out (above), so highestLiveVersion(old) returns the next head (liveCount>1).
        if (current?.currentVersionId === versionId) {
            const head = await highestLiveVersion(tx, asset.id)
            await tx.reviewAsset.update({ where: { id: asset.id }, data: { currentVersionId: head?.id ?? null } })
        }
        await tx.reviewAsset.update({ where: { id: newAssetId }, data: { currentVersionId: versionId } })
        // Same folder → bytes unchanged; the folder just gained one asset.
        await tx.reviewFolder.update({ where: { id: asset.folderId }, data: { itemCount: { increment: 1 } } })

        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.VERSION_DETACHED,
            workspaceId: asset.workspaceId,
            folderId: asset.folderId,
            assetId: asset.id,
            versionId,
            actorUserId: access.userId,
            meta: { versionNumber: version.versionNumber, newAssetId },
        })
        return { newAssetId, assetId: asset.id }
    })
}

// ─────────────────────────── merge asset → asset (drag asset onto asset) ───────────────────────────

/**
 * Merge SOURCE stack into TARGET as its newest version(s) (FR-C01 path 2). Every LIVE
 * source version physically moves into the target stack (flat — no stack-in-stack),
 * renumbered target-max+1.. in chronological order; their comments follow via versionId.
 * The source asset is soft-deleted (ceases to be standalone; its share link would 410 —
 * a hook for P5). currentVersionId of target re-points to the new head.
 */
export async function mergeStacks(
    sourceAssetId: string,
    targetAssetId: string,
): Promise<{ targetAssetId: string; mergedCount: number; currentVersionId: string }> {
    if (sourceAssetId === targetAssetId) throw apiError(400, 'VALIDATION_ERROR', 'Không thể gộp một asset vào chính nó.')
    const [source, target] = await Promise.all([
        prisma.reviewAsset.findFirst({ where: { id: sourceAssetId, deletedAt: null } }),
        prisma.reviewAsset.findFirst({ where: { id: targetAssetId, deletedAt: null } }),
    ])
    if (!source || !target) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset nguồn hoặc đích.')
    if (source.workspaceId !== target.workspaceId) throw apiError(400, 'CROSS_WORKSPACE', 'Hai asset khác workspace.')
    const access = await requireReviewAccess({ workspaceId: target.workspaceId })
    // [FR-03] editor chỉ gộp khi CẢ nguồn + đích trong phạm vi được giao.
    {
        const scope = await getFolderScope({ userId: access.userId, workspaceId: target.workspaceId, isAdmin: access.isAdmin })
        await assertAssetInScope(scope, sourceAssetId, 'write')
        await assertAssetInScope(scope, targetAssetId, 'write')
    }
    if (source.mediaKind !== target.mediaKind) {
        throw apiError(400, 'VALIDATION_ERROR', 'Không thể gộp ảnh và video vào cùng một stack.', { reason: 'media_kind' })
    }

    // Block while EITHER stack has a version mid-upload (FR-C01 AC4).
    const busy = await prisma.reviewVersion.findFirst({
        where: { assetId: { in: [sourceAssetId, targetAssetId] }, deletedAt: null, pipelineStatus: { in: NOT_TERMINAL } },
        select: { id: true },
    })
    if (busy) throw apiError(409, 'STATE_INVALID', 'Chờ upload hiện tại hoàn tất.', { reason: 'uploading' })

    const srcVersions = await prisma.reviewVersion.findMany({
        where: { assetId: sourceAssetId, deletedAt: null },
        orderBy: { versionNumber: 'asc' }, // chronological → append in order
    })
    if (srcVersions.length === 0) throw apiError(409, 'STATE_INVALID', 'Asset nguồn không có phiên bản để gộp.')
    const movedBytes = srcVersions.reduce((s, v) => s + v.sizeBytes, BigInt(0))

    return prisma.$transaction(async (tx) => {
        // max target versionNumber counting DELETED rows too (I1 — numbers never reused).
        const agg = await tx.reviewVersion.aggregate({ where: { assetId: targetAssetId }, _max: { versionNumber: true } })
        let next = (agg._max.versionNumber ?? 0) + 1
        let headId = source.currentVersionId ?? srcVersions[srcVersions.length - 1].id
        for (const v of srcVersions) {
            await tx.reviewVersion.update({
                where: { id: v.id },
                data: { assetId: targetAssetId, versionNumber: next, workspaceId: target.workspaceId },
            })
            headId = v.id
            next += 1
        }
        // Source is consumed → soft-delete it (own batch) and DROP its head pointer FIRST, so the
        // @unique currentVersionId slot is released BEFORE the target claims the same version id as
        // its new head. source.currentVersionId still points at a moved version (often === headId),
        // so setting target.currentVersionId = headId while source also holds it → P2002. Release, then claim.
        const batchId = randomUUID()
        await tx.reviewAsset.update({
            where: { id: sourceAssetId },
            data: { currentVersionId: null, deletedAt: new Date(), deletedById: access.userId, deleteBatchId: batchId },
        })
        // Target head = the last (highest-numbered) moved version.
        await tx.reviewAsset.update({ where: { id: targetAssetId }, data: { currentVersionId: headId, rowVersion: { increment: 1 } } })

        // Counters: bytes leave the source folder chain, join the target folder chain;
        // source folder loses one asset. (Same folder → the byte deltas net to zero.)
        const [srcFolder, tgtFolder] = await Promise.all([
            tx.reviewFolder.findUnique({ where: { id: source.folderId }, select: { path: true } }),
            tx.reviewFolder.findUnique({ where: { id: target.folderId }, select: { path: true } }),
        ])
        await tx.reviewFolder.update({ where: { id: source.folderId }, data: { itemCount: { decrement: 1 } } })
        if (srcFolder) await addBytesToAncestors(tx, pathIds(srcFolder.path), -movedBytes)
        if (tgtFolder) await addBytesToAncestors(tx, pathIds(tgtFolder.path), movedBytes)

        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.STACK_MERGED,
            workspaceId: target.workspaceId,
            folderId: target.folderId,
            assetId: targetAssetId,
            versionId: headId,
            actorUserId: access.userId,
            meta: { sourceAssetId, mergedCount: srcVersions.length },
        })
        return { targetAssetId, mergedCount: srcVersions.length, currentVersionId: headId }
    })
}
