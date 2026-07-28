// [Review module P1.2] Upload orchestration (API-SPEC §2.1–2.4). The routes are
// thin: they validate the body then call one of these. Every mutation re-checks
// workspace access from the resolved workspaceId (defense in depth — never trust
// the caller's claimed scope). Video bytes NEVER pass through the server; we only
// mint presigned R2 URLs and bookkeep UploadSession rows.
//
// Pipeline split (decision: keep the request well under Vercel's timeout):
//   initiate → UPLOADING
//   complete → image: READY inline · video: PROCESSING + emit review/upload.completed
//   (P1.4 Inngest handler does the heavy Mux create-asset off the request path)

import { prisma } from '@/lib/db'
import { Prisma, ReviewMediaKind, ReviewPipelineStatus, ReviewState } from '@prisma/client'
import { randomUUID } from 'crypto'
import { requireReviewAccess, type ReviewAccessContext } from './access'
import { getFolderScope, assertVersionInScope, assertAssetInScope, assertFolderPathMutable } from './folder-scope'
import { apiError } from './errors'
import { inngest, REVIEW_EVENTS } from './inngest'
import { reviewLog } from './logger'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { serializeVersion, toUserRef, pipelineStatusToDto, type VersionDto, type UploadStatusDto } from './dto'
import {
    capForKind,
    mediaKindFromMime,
    type MediaKind,
} from './media-constants'
import { buildR2Key, buildSystemKey, computePartSize, computePartCount } from './upload-helpers'
import { ensureTaskFolderPath, assetNameIsAutoManaged, type BreadcrumbItem } from './task-folder'
import { reviveSystemFolderChain, pathIds } from './folders'
import { parseVideoTitle } from './parse-task-context'
import {
    createMultipart,
    presignUploadPart,
    presignPutObject,
    presignGetObject,
    completeMultipart,
    abortMultipart,
    headObject,
    deleteObject,
} from './r2'
import { mintPlaybackTokens } from './mux-jwt'
import { buildMediaLinks } from './media-links'

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000 // 24h presigned + session window
const MAX_VERSION_RETRIES = 5

// ── Public types (mirror API-SPEC §2.1) ──────────────────────────────────────

export type InitiateTarget =
    | { kind: 'folder'; folderId: string | null; workspaceId: string }
    | { kind: 'asset'; assetId: string }

export interface InitiateInput {
    fileName: string
    sizeBytes: bigint
    mimeType: string
    target: InitiateTarget
    idempotencyKey?: string | null
}

export interface InitiateBody {
    uploadSessionId: string
    assetId: string
    versionId: string
    versionNumber: number
    r2Key: string
    partSize: number
    parts: { partNumber: number; url: string }[]
    expiresAt: string
}

export interface InitiateResult {
    status: 200 | 201 // 201 fresh, 200 idempotent replay
    body: InitiateBody
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Never-throw domain error → standard envelope (withReviewRoute returns it). */
function fail(status: number, code: Parameters<typeof apiError>[1], message: string, details?: Record<string, unknown>): never {
    throw apiError(status, code, message, details)
}

function stripExt(name: string): string {
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    return base.trim() || name.trim() || 'Untitled'
}

function toPrismaKind(kind: MediaKind): ReviewMediaKind {
    return kind === 'VIDEO' ? ReviewMediaKind.VIDEO : ReviewMediaKind.IMAGE
}

/** Ensure the one root folder for a workspace exists (systemKey-idempotent, race-safe). */
async function ensureRootFolder(userId: string, workspaceId: string): Promise<string> {
    const systemKey = buildSystemKey({ workspaceId })
    const existing = await prisma.reviewFolder.findUnique({ where: { systemKey } })
    if (existing) {
        // A trashed root squats the unique systemKey forever, so no replacement can be created
        // and everything uploaded afterwards lands under a soft-deleted ancestor — invisible in
        // Tệp. Revive before handing it out (see reviveSystemFolderChain).
        if (existing.deletedAt) await reviveSystemFolderChain(existing.id)
        return existing.id
    }
    try {
        // [audit 2026-07-27 · HIGH] The row used to be committed with the placeholder path '/' and
        // patched by a SECOND, non-transactional statement. Between the two, the root was visible
        // to every concurrent reader with a path that matches NOTHING (`path LIKE '/%'` prefix
        // logic, ancestor walks, folder-scope) — and if the process died in that window the
        // workspace was left with a permanently broken root that the unique systemKey prevents
        // replacing. Generate the id first so the row is correct the instant it exists, exactly as
        // ensureWorkspaceRoot in folders.ts already does.
        const id = randomUUID()
        const created = await prisma.reviewFolder.create({
            data: { id, workspaceId, systemKey, name: 'Team', path: `/${id}/`, depth: 0, createdById: userId },
        })
        return created.id
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const row = await prisma.reviewFolder.findUnique({ where: { systemKey } })
            if (row) {
                if (row.deletedAt) await reviveSystemFolderChain(row.id)
                return row.id
            }
        }
        throw e
    }
}

function partUrlsFor(r2Key: string, r2UploadId: string, partsTotal: number, mimeType: string): Promise<{ partNumber: number; url: string }[]> {
    if (!r2UploadId) {
        // single-part (image / tiny file): one plain presigned PUT
        return presignPutObject(r2Key, mimeType).then((url) => [{ partNumber: 1, url }])
    }
    return Promise.all(
        Array.from({ length: partsTotal }, (_v, i) =>
            presignUploadPart(r2Key, r2UploadId, i + 1).then((url) => ({ partNumber: i + 1, url })),
        ),
    )
}

// ── initiate ─────────────────────────────────────────────────────────────────

export async function initiateUpload(input: InitiateInput): Promise<InitiateResult> {
    // 1. content validation (independent of scope)
    if (!input.fileName || input.fileName.length > 255) {
        fail(400, 'VALIDATION_ERROR', 'Tên tệp phải từ 1–255 ký tự.')
    }
    if (input.sizeBytes <= BigInt(0)) fail(400, 'VALIDATION_ERROR', 'Kích thước tệp không hợp lệ.')
    const kind = mediaKindFromMime(input.mimeType, input.fileName)
    if (!kind) fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ nhận ảnh hoặc video.')
    if (input.sizeBytes > capForKind(kind)) {
        fail(413, 'FILE_TOO_LARGE', 'Tệp vượt quá giới hạn dung lượng.', { kind })
    }

    // 2. idempotency replay (network retry with same key ⇒ old response, fresh URLs)
    if (input.idempotencyKey) {
        const existing = await prisma.uploadSession.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: { version: true },
        })
        if (existing) return replaySession(existing.id)
    }

    // 3. resolve target + authorize the RESOLVED workspace
    let workspaceId: string
    let folderId: string
    let assetId: string
    let versionNumber: number
    let access: ReviewAccessContext
    let createdAssetId: string | null = null

    if (input.target.kind === 'folder') {
        workspaceId = input.target.workspaceId
        access = await requireReviewAccess({ workspaceId })
        if (input.target.folderId) {
            const folder = await prisma.reviewFolder.findFirst({
                where: { id: input.target.folderId, workspaceId, deletedAt: null },
            })
            if (!folder) fail(404, 'NOT_FOUND', 'Không tìm thấy thư mục.')
            // [FR-03] editor chỉ tạo asset trong folder được giao (mutable). Root free-upload
            // (không folderId) tạo asset của chính editor nên nhánh else không chặn.
            assertFolderPathMutable(await getFolderScope({ userId: access.userId, workspaceId, isAdmin: access.isAdmin }), folder.path)
            folderId = folder.id
            // [audit 2026-07-27 · LOW] The read above and this create used to be two independent
            // round-trips, so an admin trashing the folder in between produced a LIVE asset under a
            // TRASHED parent: deleteItems snapshots its subtree inside its own tx and never sees a row
            // created afterwards. The upload then ran to completion — R2 stored the object, Mux billed
            // the encode — for an asset that appears nowhere in /team (its parent is filtered out) and
            // whose folder 404s. It also pins that folder's purge forever. Re-read the folder inside a
            // transaction under the same advisory lock moveItems uses, so a concurrent delete either
            // loses the row it is sweeping or is serialized behind us.
            const asset = await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}, 0))`
                const stillLive = await tx.reviewFolder.count({ where: { id: folderId, deletedAt: null } })
                if (stillLive === 0) fail(404, 'NOT_FOUND', 'Thư mục vừa bị xóa — hãy chọn thư mục khác.')
                return tx.reviewAsset.create({
                    data: {
                        folderId,
                        workspaceId,
                        clientId: folder.clientId,
                        taskId: folder.taskId,
                        name: stripExt(input.fileName),
                        mediaKind: toPrismaKind(kind),
                        createdById: access.userId,
                    },
                })
            })
            assetId = asset.id
        } else {
            folderId = await ensureRootFolder(access.userId, workspaceId)
            const asset = await prisma.reviewAsset.create({
                data: {
                    folderId,
                    workspaceId,
                    name: stripExt(input.fileName),
                    mediaKind: toPrismaKind(kind),
                    createdById: access.userId,
                },
            })
            assetId = asset.id
        }
        createdAssetId = assetId
        versionNumber = 1
    } else {
        const asset = await prisma.reviewAsset.findFirst({
            where: { id: input.target.assetId, deletedAt: null },
        })
        if (!asset) fail(404, 'NOT_FOUND', 'Không tìm thấy asset.')
        access = await requireReviewAccess({ workspaceId: asset.workspaceId })
        // [FR-03] editor chỉ chồng version lên asset trong phạm vi được giao.
        await assertAssetInScope(await getFolderScope({ userId: access.userId, workspaceId: asset.workspaceId, isAdmin: access.isAdmin }), asset.id, 'write')
        if (asset.mediaKind !== toPrismaKind(kind)) {
            fail(409, 'STATE_INVALID', 'Loại media không khớp với stack hiện có (không thể chồng ảnh lên video).')
        }
        workspaceId = asset.workspaceId
        assetId = asset.id
        const maxV = await prisma.reviewVersion.aggregate({
            where: { assetId },
            _max: { versionNumber: true },
        })
        versionNumber = (maxV._max.versionNumber ?? 0) + 1
    }

    // 4. create the version row (race-safe on @@unique([assetId, versionNumber]))
    const partSize = computePartSize(input.sizeBytes)
    const partsTotal = computePartCount(input.sizeBytes, partSize)
    let version = await createVersionWithRetry({
        assetId,
        workspaceId,
        versionNumberStart: versionNumber,
        fileName: input.fileName,
        kind,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploaderId: access.userId,
        allowRenumber: input.target.kind === 'asset',
    })
    versionNumber = version.versionNumber
    const r2Key = buildR2Key(workspaceId, assetId, versionNumber, input.fileName)

    // New asset's only version is the head from birth (renders while processing).
    if (createdAssetId) {
        await prisma.reviewAsset.update({
            where: { id: createdAssetId },
            data: { currentVersionId: version.id },
        })
    }

    // 5. R2 multipart (or a single presigned PUT for images / tiny files)
    const single = partsTotal <= 1
    let r2UploadId = ''
    if (!single) r2UploadId = await createMultipart(r2Key, input.mimeType)

    // 6. persist the session (idempotency guard). Concurrent dup key ⇒ clean up + replay.
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS)
    try {
        const session = await prisma.uploadSession.create({
            data: {
                versionId: version.id,
                idempotencyKey: input.idempotencyKey ?? null,
                r2Key,
                r2UploadId,
                partSizeBytes: partSize,
                partsTotal,
                expiresAt,
            },
        })
        await prisma.reviewVersion.update({ where: { id: version.id }, data: { r2Key } })

        const parts = await partUrlsFor(r2Key, r2UploadId, partsTotal, input.mimeType)
        reviewLog('info', 'upload.initiate', {
            workspaceId, assetId, versionId: version.id, versionNumber,
            sizeBytes: input.sizeBytes.toString(), partsTotal, single, kind,
        })
        return {
            status: 201,
            body: {
                uploadSessionId: session.id,
                assetId,
                versionId: version.id,
                versionNumber,
                r2Key,
                partSize,
                parts,
                expiresAt: expiresAt.toISOString(),
            },
        }
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.idempotencyKey) {
            // Lost a concurrent race on idempotencyKey — roll back our garbage, replay the winner.
            if (r2UploadId) await abortMultipart(r2Key, r2UploadId).catch(() => {})
            if (createdAssetId) await prisma.reviewAsset.delete({ where: { id: createdAssetId } }).catch(() => {})
            else await prisma.reviewVersion.delete({ where: { id: version.id } }).catch(() => {})
            const winner = await prisma.uploadSession.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
            if (winner) return replaySession(winner.id)
        }
        throw e
    }
}

interface CreateVersionArgs {
    assetId: string
    workspaceId: string
    versionNumberStart: number
    fileName: string
    kind: MediaKind
    mimeType: string
    sizeBytes: bigint
    uploaderId: string
    allowRenumber: boolean
}

async function createVersionWithRetry(args: CreateVersionArgs) {
    let versionNumber = args.versionNumberStart
    for (let attempt = 0; ; attempt++) {
        try {
            return await prisma.reviewVersion.create({
                data: {
                    assetId: args.assetId,
                    workspaceId: args.workspaceId,
                    versionNumber,
                    fileName: args.fileName,
                    mediaKind: toPrismaKind(args.kind),
                    mimeType: args.mimeType,
                    sizeBytes: args.sizeBytes,
                    uploaderId: args.uploaderId,
                    pipelineStatus: ReviewPipelineStatus.UPLOADING,
                },
            })
        } catch (e) {
            const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
            if (dup && args.allowRenumber && attempt < MAX_VERSION_RETRIES) {
                const maxV = await prisma.reviewVersion.aggregate({
                    where: { assetId: args.assetId },
                    _max: { versionNumber: true },
                })
                versionNumber = (maxV._max.versionNumber ?? versionNumber) + 1
                continue
            }
            throw e
        }
    }
}

/** Re-presign an existing session's parts (idempotent replay / URL refresh). */
async function replaySession(sessionId: string): Promise<InitiateResult> {
    const session = await prisma.uploadSession.findUnique({
        where: { id: sessionId },
        include: { version: true },
    })
    if (!session) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên tải lên.')
    const v = session.version
    await requireReviewAccess({ workspaceId: v.workspaceId })

    const done = session.completedAt != null || session.abortedAt != null
    const parts = done ? [] : await partUrlsFor(session.r2Key, session.r2UploadId, session.partsTotal, v.mimeType)
    return {
        status: 200,
        body: {
            uploadSessionId: session.id,
            assetId: v.assetId,
            versionId: v.id,
            versionNumber: v.versionNumber,
            r2Key: session.r2Key,
            partSize: session.partSizeBytes,
            parts,
            expiresAt: session.expiresAt.toISOString(),
        },
    }
}

// ── complete ─────────────────────────────────────────────────────────────────

export interface CompleteResult {
    versionId: string
    uploadStatus: UploadStatusDto
}

/**
 * Idempotent, concurrency-safe transition of a finalized upload out of UPLOADED.
 * The version's pipelineStatus is the single source of truth: the atomic
 * UPLOADED→(READY|PROCESSING) flip elects exactly ONE request to write the
 * activity rows + emit the Mux job. Safe to re-run (crash / tx-failure self-heal
 * on retry). MUST only be called once R2 is confirmed finalized (session.completedAt
 * set). Returns the resulting status; throws 409 if a concurrent abort deleted it.
 */
export async function driveCompletion(versionId: string): Promise<UploadStatusDto> {
    const version = await prisma.reviewVersion.findUnique({
        where: { id: versionId },
        include: { asset: { select: { taskId: true } } },
    })
    if (!version) fail(409, 'STATE_INVALID', 'Phiên tải lên đã bị hủy.')
    // Only UPLOADED needs driving; anything else is already-driven (ready/processing/failed)
    // or not-yet-finalized (uploading) — report the truth without touching it.
    if (version.pipelineStatus !== ReviewPipelineStatus.UPLOADED) {
        return pipelineStatusToDto(version.pipelineStatus)
    }

    const isImage = version.mediaKind === ReviewMediaKind.IMAGE
    const target = isImage ? ReviewPipelineStatus.READY : ReviewPipelineStatus.PROCESSING

    const won = await prisma.$transaction(async (tx) => {
        const now = new Date()
        const flip = await tx.reviewVersion.updateMany({
            where: { id: versionId, pipelineStatus: ReviewPipelineStatus.UPLOADED },
            data: isImage
                ? { pipelineStatus: target, reviewState: ReviewState.AWAITING_REVIEW, readyAt: now }
                : { pipelineStatus: target },
        })
        if (flip.count === 0) return false // another request drove it first
        if (isImage) {
            // image head flips to this version now (video flips on webhook ready — P1.3).
            // Clear a stale guest-approval (FR-A04 AC2) — same as applyMuxReady for video.
            const { REVIEW_STATUS_MAP } = await import('./status-map')
            await tx.reviewAsset.updateMany({
                where: { id: version.assetId, statusId: REVIEW_STATUS_MAP.approved },
                data: { statusId: null, rowVersion: { increment: 1 } },
            })
            await tx.reviewAsset.update({ where: { id: version.assetId }, data: { currentVersionId: versionId } })
        }
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.VERSION_UPLOADED,
            workspaceId: version.workspaceId,
            taskId: version.asset.taskId,
            assetId: version.assetId,
            versionId,
            actorUserId: version.uploaderId,
            meta: { versionNumber: version.versionNumber, fileName: version.fileName, sizeBytes: version.sizeBytes.toString() },
        })
        if (isImage) {
            await recordActivity(tx, {
                type: REVIEW_ACTIVITY.VERSION_READY,
                workspaceId: version.workspaceId,
                taskId: version.asset.taskId,
                assetId: version.assetId,
                versionId,
                actorUserId: version.uploaderId,
                meta: { versionNumber: version.versionNumber },
            })
        }
        return true
    })

    if (won) {
        if (!isImage) {
            // Hand the Mux create-asset work to Inngest (off the request path).
            try {
                await inngest.send({ name: REVIEW_EVENTS.UPLOAD_COMPLETED, data: { versionId } })
            } catch (e) {
                // The PROCESSING version + P1.6 reconcile job are the ledger of record; don't fail the request.
                reviewLog('error', 'upload.complete.inngest_send_failed', { versionId, error: String(e) })
            }
        }
        reviewLog('info', 'upload.complete.driven', { versionId, status: pipelineStatusToDto(target) })
        return pipelineStatusToDto(target)
    }
    // Lost the flip race — report whatever the winner set.
    const fresh = await prisma.reviewVersion.findUnique({ where: { id: versionId }, select: { pipelineStatus: true } })
    return fresh ? pipelineStatusToDto(fresh.pipelineStatus) : pipelineStatusToDto(target)
}

/** Revert the UPLOADED finalize-claim to UPLOADING (R2 finalize failed → allow a corrected retry). */
async function revertFinalizeClaim(versionId: string): Promise<void> {
    await prisma.reviewVersion
        .updateMany({
            where: { id: versionId, pipelineStatus: ReviewPipelineStatus.UPLOADED },
            data: { pipelineStatus: ReviewPipelineStatus.UPLOADING },
        })
        .catch(() => {})
}

export async function completeUpload(
    uploadSessionId: string,
    parts: { partNumber: number; etag: string }[],
): Promise<CompleteResult> {
    const session = await prisma.uploadSession.findUnique({
        where: { id: uploadSessionId },
        include: { version: true },
    })
    if (!session) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên tải lên.')
    const version = session.version
    await requireReviewAccess({ workspaceId: version.workspaceId })

    if (session.abortedAt) fail(409, 'STATE_INVALID', 'Phiên tải lên đã bị hủy.')

    // version.pipelineStatus is the claim token (single source of truth):
    //   UPLOADING  → not finalized yet; this request tries to claim R2 finalize.
    //   UPLOADED   → R2 finalized (once session.completedAt is set); (self-)drive the transition.
    //   PROCESSING / READY / FAILED → already driven → idempotent echo.
    if (version.pipelineStatus !== ReviewPipelineStatus.UPLOADING) {
        // UPLOADED with completedAt still null = a concurrent complete is mid-R2 → don't drive; echo.
        if (version.pipelineStatus === ReviewPipelineStatus.UPLOADED && !session.completedAt) {
            return { versionId: version.id, uploadStatus: pipelineStatusToDto(version.pipelineStatus) }
        }
        return { versionId: version.id, uploadStatus: await driveCompletion(version.id) }
    }
    if (session.expiresAt.getTime() < Date.now()) fail(410, 'UPLOAD_EXPIRED', 'Phiên tải lên đã hết hạn.')
    if (session.r2UploadId && !parts.length) fail(400, 'VALIDATION_ERROR', 'Thiếu danh sách part để hoàn tất.')

    // Atomic finalize-claim: only the request that flips UPLOADING→UPLOADED runs the R2 finalize.
    // This same row is the lock abort competes for (abort flips UPLOADING→FAILED) → mutual exclusion.
    const claim = await prisma.reviewVersion.updateMany({
        where: { id: version.id, pipelineStatus: ReviewPipelineStatus.UPLOADING },
        data: { pipelineStatus: ReviewPipelineStatus.UPLOADED },
    })
    if (claim.count === 0) {
        // Lost the race (concurrent complete claimed, or abort flipped/deleted it). Resolve to truth.
        const fresh = await prisma.uploadSession.findUnique({ where: { id: session.id }, include: { version: true } })
        if (!fresh || fresh.abortedAt) fail(409, 'STATE_INVALID', 'Phiên tải lên đã bị hủy.')
        if (fresh.version.pipelineStatus === ReviewPipelineStatus.UPLOADED && !fresh.completedAt) {
            return { versionId: fresh.version.id, uploadStatus: pipelineStatusToDto(fresh.version.pipelineStatus) }
        }
        return { versionId: fresh.version.id, uploadStatus: await driveCompletion(fresh.version.id) }
    }

    // We own the R2 finalize. On failure, revert UPLOADED→UPLOADING so a corrected retry re-claims.
    let r2Ok = true
    try {
        if (session.r2UploadId) {
            await completeMultipart(session.r2Key, session.r2UploadId, parts)
        } else {
            // single-part PUT already wrote the object — just confirm it exists
            r2Ok = (await headObject(session.r2Key)) != null
        }
    } catch (e) {
        reviewLog('error', 'upload.complete.r2_failed', { uploadSessionId, error: String(e) })
        await revertFinalizeClaim(version.id)
        fail(502, 'UPSTREAM_ERROR', 'Không thể hoàn tất tải lên trên kho lưu trữ.', { provider: 'r2' })
    }
    if (!r2Ok) {
        await revertFinalizeClaim(version.id)
        fail(400, 'VALIDATION_ERROR', 'Chưa nhận được nội dung tệp trên kho lưu trữ.')
    }

    // [C1] Enforce the size cap on the ACTUAL stored bytes. `initiate` only checked the CLIENT-declared
    // sizeBytes and the presigned PUT/parts pin no Content-Length, so the real object can far exceed the
    // cap (storage/cost DoS). Verify the real size and reject BEFORE promoting to READY — delete the
    // object + mark the version FAILED so a retry must re-upload within the cap.
    const stored = await headObject(session.r2Key)
    if (stored && BigInt(stored.size) > capForKind(version.mediaKind)) {
        await deleteObject(session.r2Key).catch(() => {})
        await prisma.reviewVersion
            .updateMany({ where: { id: version.id }, data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Tệp vượt quá dung lượng cho phép.' } })
            .catch(() => {})
        fail(413, 'FILE_TOO_LARGE', 'Tệp vượt quá dung lượng cho phép.', { maxBytes: capForKind(version.mediaKind).toString() })
    }

    // R2 object is final — mark the session (bookkeeping + the gate driveCompletion relies on),
    // then drive the state machine. driveCompletion is idempotent, so a retry after a crash here
    // (session marked done, version still UPLOADED) self-heals on the next complete/poll call.
    await prisma.uploadSession
        .update({ where: { id: session.id }, data: { completedAt: new Date(), partsDone: session.partsTotal } })
        .catch(() => {})
    reviewLog('info', 'upload.complete', { uploadSessionId, versionId: version.id })
    return { versionId: version.id, uploadStatus: await driveCompletion(version.id) }
}

// ── abort ────────────────────────────────────────────────────────────────────

export async function abortUpload(uploadSessionId: string): Promise<{ aborted: true }> {
    const session = await prisma.uploadSession.findUnique({
        where: { id: uploadSessionId },
        include: { version: { include: { asset: { select: { id: true } } } } },
    })
    // Idempotent: an already-aborted/hard-deleted (or never-existent) session is a no-op.
    // Returning the same shape for "gone" and "not yours" also denies an enumeration oracle.
    if (!session) return { aborted: true }
    const version = session.version
    await requireReviewAccess({ workspaceId: version.workspaceId })

    if (session.abortedAt) return { aborted: true }
    // Only an in-flight upload (version still UPLOADING) may be discarded. Once a complete has
    // claimed the finalize (UPLOADED) or the version is PROCESSING/READY/FAILED, aborting must NOT
    // destroy it — removing a finalized version is a trash operation (P2/P6), not an upload abort.
    if (version.pipelineStatus !== ReviewPipelineStatus.UPLOADING) return { aborted: true }

    // Atomic claim — mutually exclusive with completeUpload over the SAME version row: complete flips
    // UPLOADING→UPLOADED, abort flips UPLOADING→FAILED. Exactly one wins; the loser is a no-op.
    const claim = await prisma.reviewVersion.updateMany({
        where: { id: version.id, pipelineStatus: ReviewPipelineStatus.UPLOADING },
        data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Đã hủy tải lên.' },
    })
    if (claim.count === 0) return { aborted: true } // complete claimed the finalize first — leave it

    // Mark the session aborted for the audit trail (the row itself is about to be cascade-deleted).
    await prisma.uploadSession.update({ where: { id: session.id }, data: { abortedAt: new Date() } }).catch(() => {})

    // Free the staged bytes on R2 (best-effort; R2 abort/delete are idempotent).
    if (session.r2UploadId) await abortMultipart(session.r2Key, session.r2UploadId).catch(() => {})
    else await deleteObject(session.r2Key).catch(() => {})

    // Discard the in-flight version (cascades this session; FK SetNulls asset.currentVersionId).
    // Then delete the asset ONLY if it is now empty — a concurrently-created sibling keeps it alive
    // (deleteMany + relation filter is atomic, so no stale-count cascade of a live version).
    await prisma.reviewVersion.delete({ where: { id: version.id } })
    await prisma.reviewAsset.deleteMany({ where: { id: version.asset.id, versions: { none: {} } } })
    reviewLog('info', 'upload.abort', { uploadSessionId })
    return { aborted: true }
}

// ── poll ─────────────────────────────────────────────────────────────────────

export interface UploadStatusResult {
    uploadStatus: ReturnType<typeof pipelineStatusToDto>
    version: VersionDto | null
    error?: string
}

export async function getUploadStatus(uploadSessionId: string): Promise<UploadStatusResult> {
    const session = await prisma.uploadSession.findUnique({
        where: { id: uploadSessionId },
        include: { version: true },
    })
    if (!session) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên tải lên.')
    let version = session.version
    await requireReviewAccess({ workspaceId: version.workspaceId })

    // Self-heal the crash window: if a complete finalized R2 (completedAt set) but died before
    // driving the transition, the version is stuck UPLOADED. The client's 3s poller only stops on
    // ready|failed, so drive it here (idempotent) and re-read so the poll can converge.
    if (version.pipelineStatus === ReviewPipelineStatus.UPLOADED && session.completedAt) {
        await driveCompletion(version.id)
        version = (await prisma.reviewVersion.findUnique({ where: { id: version.id } })) ?? version
    }

    const uploader = await prisma.user.findUnique({
        where: { id: version.uploaderId },
        select: { id: true, displayName: true, username: true, nickname: true, avatarUrl: true },
    })
    // Mux signed poster/storyboard links (P1.7) — only for a READY video with a playback id.
    const media =
        version.pipelineStatus === ReviewPipelineStatus.READY
            ? buildMediaLinks({ muxPlaybackId: version.muxPlaybackId, thumbTime: version.thumbTime })
            : null
    const dto = serializeVersion(version, { uploader: toUserRef(uploader), media })
    return {
        uploadStatus: pipelineStatusToDto(version.pipelineStatus),
        version: dto,
        ...(version.errorMessage ? { error: version.errorMessage } : {}),
    }
}

// ── task-upload (BÀN GIAO) ─────────────────────────────────────────────────────

export interface TaskInitiateResult {
    status: 200 | 201
    body: InitiateBody & { createdNewAsset: boolean; folderPath: BreadcrumbItem[] }
}

/**
 * Upload from the task drawer's "Up thẳng video" (API-SPEC §6.1): resolve the
 * client/brand/video folder tree from the task title, auto-version onto the task's
 * existing deliverable of the same name (or create it), then reuse initiateUpload.
 * VIDEO only. NOTE (P1.5): the (taskId, name) asset match has no DB unique — two
 * truly-simultaneous submits without an Idempotency-Key could make 2 assets; the
 * idempotency key (client-sent) covers the normal retry case.
 */
export async function initiateTaskUpload(input: {
    taskId: string
    fileName: string
    sizeBytes: bigint
    mimeType: string
    idempotencyKey?: string | null
    /** [foldering 2026-07-27] How many files the user dropped in THIS single action.
     *
     *  This one number decides the whole shape, because it is the only unambiguous signal we have:
     *    1  → "here is the (next) cut of this task's video". Asset is named from the TASK title, so
     *         the existing (taskId, name) match turns a later upload into v2 — the feedback→revise
     *         loop, untouched. Lands FLAT in the client/brand folder: no wrapper.
     *    N>1 → "here are N siblings" (a multi-hook set). Each file becomes its OWN asset named from
     *         its FILENAME, and they are grouped into the per-task video folder.
     *
     *  Naming from the task title is exactly why N files used to collapse into one asset with N
     *  versions: every file resolved to the same name and hit the auto-version match. Removing the
     *  wrapper folder alone would NOT have fixed that — the folder was never the blocker. */
    batchSize?: number
    /** [owner request 2026-07-27] Force this upload onto a SPECIFIC existing deliverable.
     *
     *  Name matching is a good default but it is a guess, and on a multi-hook task a one-character
     *  difference in a filename silently mints a new video instead of adding v2 — the editor only
     *  finds out afterwards. When the uploader has picked the target in the confirm strip, that
     *  choice is authoritative and no guessing happens at all. */
    targetAssetId?: string
}): Promise<TaskInitiateResult> {
    const kind = mediaKindFromMime(input.mimeType, input.fileName)
    if (kind !== 'VIDEO') fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Chỉ nhận file video ở mục bàn giao.')
    const isBatch = (input.batchSize ?? 1) > 1

    const task = await prisma.task.findFirst({
        where: { id: input.taskId },
        select: {
            id: true, title: true, clientId: true, workspaceId: true, isArchived: true, assigneeId: true,
            client: { select: { name: true } },
            workspace: { select: { name: true } },
        },
    })
    if (!task) fail(404, 'NOT_FOUND', 'Không tìm thấy task.')
    if (!task.workspaceId) fail(409, 'STATE_INVALID', 'Task chưa thuộc workspace nào.')
    if (task.isArchived) fail(409, 'STATE_INVALID', 'Task đã lưu trữ — không thể tải bản dựng lên.')
    const workspaceId = task.workspaceId // narrowed to string for the closures below
    const access = await requireReviewAccess({ workspaceId })
    // [FR-03] editor chỉ bàn giao bản dựng cho task ĐƯỢC GIAO cho mình (folder-scope suy ra
    // từ assigneeId); admin/owner workspace không giới hạn.
    if (!access.isAdmin && task.assigneeId !== access.userId) {
        fail(403, 'FORBIDDEN', 'Bạn không có quyền bàn giao bản dựng cho task ngoài phạm vi được giao.')
    }

    const parsed = parseVideoTitle(task.title, task.client?.name ?? '')
    const clientIdStr = task.clientId != null ? String(task.clientId) : null

    // [audit 2026-07-27 · LOW] ensureTaskFolderPath used to run unconditionally, BEFORE anything
    // checked whether this deliverable already exists. When it did, the new version landed on that
    // asset wherever it currently lives — the auto-version match keys on (taskId, name) with no
    // folderId constraint — while a brand-new, permanently EMPTY auto folder chain was materialised
    // on every such upload. Resolve it lazily instead: only an upload that actually creates an asset
    // needs the chain.
    let ensured: Awaited<ReturnType<typeof ensureTaskFolderPath>> | null = null
    const ensureChain = () =>
        ensureTaskFolderPath({
            workspaceId,
            rootName: task.workspace?.name ?? 'Team',
            taskId: task.id,
            clientId: clientIdStr,
            parsed,
            createdById: access.userId,
            groupInFolder: isBatch,
        })

    // [foldering 2026-07-27] Asset identity. Single upload keeps naming from the TASK, so the
    // (taskId, name) match below still turns the next upload into v2 — the revise loop is untouched.
    // A batch names each file from ITSELF, so N hooks become N sibling assets instead of N versions
    // of one, and re-dropping the same filename later still versions THAT hook correctly.
    const baseAssetName = isBatch ? stripExt(input.fileName) : parsed.video

    // Auto-version: same task + same (case-insensitive) asset name ⇒ a new version on the stack.
    // ReviewAsset has no unique on (taskId, name), so serialize concurrent uploads to the SAME
    // deliverable with a transaction-scoped advisory lock. The lock key is (task, asset-name), not
    // the folder: since flat uploads now share one client folder across many tasks, a folder-keyed
    // lock would serialize every unrelated upload for that client.
    // Scoped by workspaceId (defence-in-depth against denormalization drift).
    //
    // The retry loop exists because flat mode moved assets into a SHARED folder, where the DB's
    // partial index UNIQUE ("folderId", lower("name")) WHERE "deletedAt" IS NULL can now be hit by a
    // DIFFERENT task whose title parses to the same video name. A P2002 aborts the surrounding
    // Postgres transaction, so the retry has to re-run the whole tx with the next suffix rather than
    // catch inside it.
    // Sentinel for "the tx needs to create, but the folder chain was never resolved". Only reachable
    // when the cheap pre-check below saw an existing asset that vanished before the lock was taken.
    class NeedFolderChain extends Error {}

    // An explicitly chosen target short-circuits every guess below. Validated against THIS task so a
    // caller cannot stack a version onto someone else's deliverable by passing an arbitrary id.
    if (input.targetAssetId) {
        const target = await prisma.reviewAsset.findFirst({
            where: { id: input.targetAssetId, taskId: task.id, workspaceId, deletedAt: null },
            select: { id: true },
        })
        if (!target) fail(404, 'NOT_FOUND', 'Video được chọn không thuộc task này hoặc đã bị xóa.')
        const init = await initiateUpload({
            fileName: input.fileName,
            sizeBytes: input.sizeBytes,
            mimeType: input.mimeType,
            target: { kind: 'asset', assetId: target.id },
            idempotencyKey: input.idempotencyKey,
        })
        return {
            status: init.status,
            body: {
                ...init.body,
                createdNewAsset: false,
                folderPath: (await breadcrumbForAsset(target.id)) ?? [],
            },
        }
    }

    let resolved: { assetId: string; createdNewAsset: boolean } | null = null
    for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt++) {
        const assetName = attempt === 0 ? baseAssetName : `${baseAssetName} (${attempt + 1})`
        const lockKey = `${task.id}:${assetName.toLowerCase()}`
        // Unlocked pre-check, purely to decide whether the folder chain is needed. The authoritative
        // answer is the locked lookup inside the tx; being wrong here costs one retry, not an error.
        if (!ensured) {
            const pre = await prisma.reviewAsset.findFirst({
                where: { taskId: task.id, workspaceId, deletedAt: null, name: { equals: assetName, mode: 'insensitive' } },
                select: { id: true },
            })
            if (!pre) ensured = await ensureChain()
        }
        try {
            resolved = await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
                const existing = await tx.reviewAsset.findFirst({
                    where: { taskId: task.id, workspaceId, deletedAt: null, name: { equals: assetName, mode: 'insensitive' } },
                    orderBy: { createdAt: 'asc' },
                    select: { id: true },
                })
                if (existing) return { assetId: existing.id, createdNewAsset: false }

                // [owner request 2026-07-27] Matching purely on the name broke the revise loop the
                // moment a task was RENAMED: the next upload found nothing under the new name and
                // started a SECOND deliverable instead of adding v2 — the stack forked in two, which
                // is exactly what naming-from-the-task is supposed to prevent.
                //
                // For a single-file upload, when the task holds EXACTLY ONE live deliverable, that
                // one IS the stack whatever it is currently called. More than one means a multi-hook
                // set, where each hook has its own identity, so name matching stays authoritative.
                if (!isBatch) {
                    const solo = await tx.reviewAsset.findMany({
                        where: { taskId: task.id, workspaceId, deletedAt: null },
                        select: { id: true, name: true },
                        take: 2, // only need to know "exactly one"
                    })
                    if (solo.length === 1) {
                        const asset = solo[0]
                        // Keep the name in sync with the task — but never overwrite one a PERSON
                        // chose. The gate is recency, not presence, so "Reset về tên Task" can hand
                        // the name back to automatic sync without erasing the rename from history.
                        if (asset.name !== assetName) {
                            if (await assetNameIsAutoManaged(tx, asset.id)) {
                                // A P2002 here (a sibling in the shared client folder already owns
                                // this name) aborts the tx and the outer loop retries with " (2)".
                                await tx.reviewAsset.update({
                                    where: { id: asset.id },
                                    data: { name: assetName, rowVersion: { increment: 1 } },
                                })
                            }
                        }
                        return { assetId: asset.id, createdNewAsset: false }
                    }
                }

                if (!ensured) throw new NeedFolderChain()
                const asset = await tx.reviewAsset.create({
                    data: {
                        folderId: ensured.videoFolder.id,
                        workspaceId,
                        clientId: clientIdStr,
                        taskId: task.id,
                        name: assetName,
                        mediaKind: ReviewMediaKind.VIDEO,
                        createdById: access.userId,
                    },
                })
                return { assetId: asset.id, createdNewAsset: true }
            })
            break
        } catch (e) {
            if (e instanceof NeedFolderChain) {
                // Resolve the chain and re-run THIS attempt (same name). Cannot recur: `ensured` is
                // now set, so the throw above is unreachable on the repeat.
                ensured = await ensureChain()
                attempt--
                continue
            }
            // Name taken in this folder by an asset belonging to ANOTHER task → try "name (2)".
            // Anything else is a real failure.
            if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
        }
    }
    if (!resolved) fail(409, 'STATE_INVALID', 'Không đặt được tên cho bản dựng — thử đổi tên file rồi tải lại.')
    const { assetId, createdNewAsset } = resolved

    const init = await initiateUpload({
        fileName: input.fileName,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        target: { kind: 'asset', assetId },
        idempotencyKey: input.idempotencyKey,
    })

    // A brand-new asset's first version is the head from birth (card renders while processing).
    if (createdNewAsset && init.status === 201) {
        await prisma.reviewAsset
            .update({ where: { id: assetId }, data: { currentVersionId: init.body.versionId } })
            .catch(() => {})
    }

    // [audit 2026-07-27 · LOW] Report where the bytes ACTUALLY landed, not the chain we ensured.
    // The auto-version match keys on (taskId, name) with no folderId constraint, so a deliverable
    // that an admin moved into a curated folder still receives its next version there — while the
    // tray announced "Đã lưu vào Team / ForTesting / Video 10000", a folder that is now empty. The
    // editor navigates there, finds nothing, and re-uploads or reports the file lost. Derive the
    // breadcrumb from the asset's own folder path; fall back to the ensured chain only if that read
    // fails, since a wrong-but-present path still beats none.
    const folderPath = (await breadcrumbForAsset(assetId)) ?? ensured?.breadcrumb ?? []

    return { status: init.status, body: { ...init.body, createdNewAsset, folderPath } }
}

/** Breadcrumb of the folder an asset currently lives in, root → parent, using the materialized path. */
async function breadcrumbForAsset(assetId: string): Promise<BreadcrumbItem[] | null> {
    const asset = await prisma.reviewAsset
        .findUnique({ where: { id: assetId }, select: { folder: { select: { path: true } } } })
        .catch(() => null)
    const path = asset?.folder?.path
    if (!path) return null
    const ids = pathIds(path)
    if (!ids.length) return null
    const rows = await prisma.reviewFolder.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    const nameById = new Map(rows.map((r) => [r.id, r.name]))
    // A missing id means the chain is broken; the ensured breadcrumb is the better answer then.
    if (ids.some((id) => !nameById.has(id))) return null
    return ids.map((id) => ({ id, name: nameById.get(id)! }))
}

// ── janitor reconcile (P1.6) ─────────────────────────────────────────────────
// Run from the nightly Inngest janitor (no request session → NO requireReviewAccess:
// these operate on server-resolved ids only). Each is idempotent + status-guarded so a
// step retry, a racing client complete/abort, or a re-run next night is all safe.
// NOTE the intentional call-time import cycle: inngest.ts imports these; this file imports
// `inngest` (driveCompletion emits UPLOAD_COMPLETED). Both sides touch the other only INSIDE
// functions (never at module top-level), so ES live-bindings resolve cleanly.

/**
 * A dead in-flight upload: the version is still UPLOADING past its 24h window (the editor's
 * browser died mid-upload). Free the staged R2 bytes and mark the version FAILED so the card
 * shows a retryable error. Unlike abortUpload (an explicit user cancel that DELETES the
 * version + empty asset), the janitor KEEPS the row — a timeout is "this upload died", not
 * "forget it happened"; the user sees "failed" and re-uploads onto the same card. The atomic
 * claim (UPLOADING→FAILED) is mutually exclusive with a late complete/abort over the row.
 */
export async function expireInflightUpload(sessionId: string): Promise<'expired' | 'noop'> {
    const session = await prisma.uploadSession.findUnique({
        where: { id: sessionId },
        include: { version: { include: { asset: { select: { taskId: true } } } } },
    })
    if (!session || session.completedAt || session.abortedAt) return 'noop'
    const version = session.version
    // State change (claim + session.abortedAt + activity) is atomic so a retry after a partial
    // write can't leave a FAILED version with no VERSION_ERROR activity.
    const claimed = await prisma.$transaction(async (tx) => {
        const claim = await tx.reviewVersion.updateMany({
            where: { id: version.id, pipelineStatus: ReviewPipelineStatus.UPLOADING },
            data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Phiên tải lên đã hết hạn (quá 24 giờ).' },
        })
        if (claim.count === 0) return false // a late complete/abort won the row → leave it
        await tx.uploadSession.updateMany({ where: { id: session.id, abortedAt: null }, data: { abortedAt: new Date() } })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.VERSION_ERROR,
            workspaceId: version.workspaceId,
            taskId: version.asset.taskId,
            assetId: version.assetId,
            versionId: version.id,
            actorUserId: version.uploaderId,
            meta: { versionNumber: version.versionNumber, errorMessage: 'expired-24h' },
        })
        return true
    })
    if (!claimed) return 'noop'
    // Free the staged bytes (best-effort, outside the tx; R2 abort/delete are idempotent — a
    // missed call just leaves orphan parts that R2's own lifecycle rule eventually reaps).
    if (session.r2UploadId) await abortMultipart(session.r2Key, session.r2UploadId).catch(() => {})
    else await deleteObject(session.r2Key).catch(() => {})
    reviewLog('info', 'upload.janitor.expired', { sessionId, versionId: version.id })
    return 'expired'
}

/**
 * A version stuck in UPLOADED: a complete claimed the finalize, then the process died before
 * driving the transition. The client's 3s poller only stops on ready|failed, so a dead browser
 * leaves it hung forever (a client retry of `complete` just echoes UPLOADED — it never re-runs
 * the finalize). Recover FORWARD when R2 actually holds the object, else FAIL once the window
 * has closed. Covers both crash windows:
 *   C2 — session.completedAt set (R2 confirmed final) → driveCompletion.
 *   C1 — completedAt lost but the object IS on R2 (crash between completeMultipart and the
 *        completedAt write) → restore completedAt + drive.
 *   C1' — object absent AND the session expired → abort R2 + mark FAILED (the parts' ETags
 *        were only in the client's complete request, so we can't finish it ourselves).
 * The caller's grace filter keeps us off versions whose finalize is still legitimately in flight.
 */
export async function reconcileStuckUploadedVersion(
    versionId: string,
): Promise<'driven' | 'failed' | 'waiting' | 'noop'> {
    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId, pipelineStatus: ReviewPipelineStatus.UPLOADED },
        include: {
            asset: { select: { taskId: true } },
            uploadSessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
    })
    if (!version) return 'noop' // a concurrent complete/poll already drove it
    const session = version.uploadSessions[0]
    if (!session) {
        reviewLog('warn', 'upload.janitor.uploaded_no_session', { versionId })
        return 'noop'
    }

    // Forward recovery — R2 is (or turns out to be) finalized.
    if (session.completedAt) {
        await driveCompletion(versionId)
        return 'driven'
    }
    const obj = await headObject(session.r2Key).catch(() => null)
    if (obj) {
        await prisma.uploadSession.updateMany({ where: { id: session.id, completedAt: null }, data: { completedAt: new Date() } })
        await driveCompletion(versionId)
        reviewLog('info', 'upload.janitor.uploaded_recovered', { versionId })
        return 'driven'
    }

    // Object absent. Only give up once the upload window has closed — a not-yet-expired session
    // may have a complete mid-R2-finalize RIGHT NOW; don't stomp it.
    if (session.expiresAt.getTime() >= Date.now()) return 'waiting'
    const failed = await prisma.$transaction(async (tx) => {
        const flip = await tx.reviewVersion.updateMany({
            where: { id: versionId, pipelineStatus: ReviewPipelineStatus.UPLOADED },
            data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Tải lên không hoàn tất trước khi hết hạn.' },
        })
        if (flip.count === 0) return false
        await tx.uploadSession.updateMany({ where: { id: session.id, abortedAt: null }, data: { abortedAt: new Date() } })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.VERSION_ERROR,
            workspaceId: version.workspaceId,
            taskId: version.asset.taskId,
            assetId: version.assetId,
            versionId,
            actorUserId: version.uploaderId,
            meta: { versionNumber: version.versionNumber, errorMessage: 'uploaded-finalize-lost' },
        })
        return true
    })
    if (!failed) return 'noop'
    if (session.r2UploadId) await abortMultipart(session.r2Key, session.r2UploadId).catch(() => {})
    reviewLog('warn', 'upload.janitor.uploaded_failed', { versionId })
    return 'failed'
}

// ── playback token + download (P1.7, API-SPEC §2.9) ──────────────────────────

export interface PlaybackTokenResult {
    playbackId: string
    tokens: { playback: string; thumbnail: string; storyboard: string }
    expiresAt: string
}

/** Mint 6h Mux signed playback tokens for a READY video. Member-scoped: re-checks
 *  workspace access from the resolved version (never trusts the caller's claim). */
export async function getVersionPlaybackTokens(versionId: string): Promise<PlaybackTokenResult> {
    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId, deletedAt: null },
        select: { id: true, workspaceId: true, pipelineStatus: true, mediaKind: true, muxPlaybackId: true },
    })
    if (!version) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên bản.')
    const access = await requireReviewAccess({ workspaceId: version.workspaceId })
    // [FR-03] editor chỉ mint playback token cho version trong phạm vi được giao.
    await assertVersionInScope(
        await getFolderScope({ userId: access.userId, workspaceId: version.workspaceId, isAdmin: access.isAdmin }),
        versionId,
        'read',
    )
    if (version.mediaKind !== ReviewMediaKind.VIDEO) {
        fail(409, 'STATE_INVALID', 'Chỉ video mới có playback token.')
    }
    if (version.pipelineStatus !== ReviewPipelineStatus.READY || !version.muxPlaybackId) {
        fail(409, 'STATE_INVALID', 'Phiên bản chưa sẵn sàng để phát.')
    }
    const { tokens, expiresAt } = mintPlaybackTokens(version.muxPlaybackId)
    reviewLog('info', 'review.playback_token', { versionId })
    return { playbackId: version.muxPlaybackId, tokens, expiresAt }
}

export interface DownloadUrlResult {
    url: string
    fileName: string
    expiresAt: string
}

const DOWNLOAD_TTL_SEC = 15 * 60 // short-lived presigned R2 GET for the original

/** Presigned R2 GET of the original file for a READY version (attachment download).
 *  Member-scoped (internal §2.9 has no approval gate — that's guest-only §5.5.7). */
export async function getVersionDownloadUrl(versionId: string): Promise<DownloadUrlResult> {
    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId, deletedAt: null },
        select: { id: true, workspaceId: true, pipelineStatus: true, r2Key: true, fileName: true },
    })
    if (!version) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên bản.')
    const access = await requireReviewAccess({ workspaceId: version.workspaceId })
    // [FR-03] editor chỉ tải version trong phạm vi được giao.
    await assertVersionInScope(
        await getFolderScope({ userId: access.userId, workspaceId: version.workspaceId, isAdmin: access.isAdmin }),
        versionId,
        'read',
    )
    if (version.pipelineStatus !== ReviewPipelineStatus.READY || !version.r2Key) {
        fail(409, 'STATE_INVALID', 'Phiên bản chưa sẵn sàng để tải xuống.')
    }
    const url = await presignGetObject(version.r2Key, {
        expiresIn: DOWNLOAD_TTL_SEC,
        downloadFileName: version.fileName,
    })
    reviewLog('info', 'review.download_url', { versionId })
    return { url, fileName: version.fileName, expiresAt: new Date(Date.now() + DOWNLOAD_TTL_SEC * 1000).toISOString() }
}
