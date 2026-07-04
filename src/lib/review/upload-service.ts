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
import { requireReviewAccess, type ReviewAccessContext } from './access'
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
import {
    createMultipart,
    presignUploadPart,
    presignPutObject,
    completeMultipart,
    abortMultipart,
    headObject,
    deleteObject,
} from './r2'

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
    if (existing) return existing.id
    try {
        const created = await prisma.reviewFolder.create({
            data: { workspaceId, systemKey, name: 'Team', path: '/', depth: 0, createdById: userId },
        })
        // Materialized path must include own id: "/{id}/".
        await prisma.reviewFolder.update({ where: { id: created.id }, data: { path: `/${created.id}/` } })
        return created.id
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const row = await prisma.reviewFolder.findUnique({ where: { systemKey } })
            if (row) return row.id
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
            folderId = folder.id
            const asset = await prisma.reviewAsset.create({
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
async function driveCompletion(versionId: string): Promise<UploadStatusDto> {
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
            // image head flips to this version now (video flips on webhook ready — P1.3)
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
    // media links (Mux signed playback) are minted in P1.7; null while uploading/processing.
    const dto = serializeVersion(version, { uploader: toUserRef(uploader), media: null })
    return {
        uploadStatus: pipelineStatusToDto(version.pipelineStatus),
        version: dto,
        ...(version.errorMessage ? { error: version.errorMessage } : {}),
    }
}
