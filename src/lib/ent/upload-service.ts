// [Giải trí] Điều phối tải phim lên. Bản rút gọn của review/upload-service.ts:
// kho phim phẳng (không thư mục, không stack phiên bản, không task), nên bỏ được
// toàn bộ phần giải mã đích đến, đánh số phiên bản và trần dung lượng theo gói.
//
// GIỮ NGUYÊN mấy điểm đã trả giá mới có ở module Tệp:
//   • byte KHÔNG đi qua server — chỉ ký URL rồi ghi sổ EntUploadSession
//   • claim nguyên tử UPLOADING→UPLOADED để complete và abort loại trừ lẫn nhau
//   • đo byte THẬT bằng headObject lúc complete (presigned PUT không ghim
//     Content-Length, nên số client khai lúc initiate là số tự khai)
//   • idempotencyKey ⇒ phát lại phản hồi cũ kèm URL mới khi mạng chập chờn
//
// KHÔNG import upload-maintenance: kho phim chạy độc lập với lịch đóng của Tệp.

import { prisma } from '@/lib/db'
import { Prisma, ReviewPipelineStatus } from '@prisma/client'
import { randomUUID } from 'crypto'
import { apiError, type ApiErrorCode } from '@/lib/review/errors'
import { reviewLog } from '@/lib/review/logger'
import { VIDEO_MIME_ALLOWLIST, VIDEO_EXT_FALLBACK } from '@/lib/review/media-constants'
import { computePartSize, computePartCount } from '@/lib/review/upload-helpers'
import {
    createMultipart,
    presignUploadPart,
    presignPutObject,
    completeMultipart,
    abortMultipart,
    headObject,
    deleteObject,
} from '@/lib/review/r2'
import { inngest } from '@/lib/review/inngest'
import { ENT_EVENTS } from './events'
import { ENT_UPLOAD_TTL_MS, ENT_VIDEO_MAX_BYTES, entSourceKey, titleFromFileName, ENT_TITLE_MAX } from './constants'

function fail(status: number, code: ApiErrorCode, message: string, details?: Record<string, unknown>): never {
    throw apiError(status, code, message, details)
}

export type EntQuality = 'basic' | 'plus'

export interface EntInitiateInput {
    fileName: string
    sizeBytes: bigint
    mimeType: string
    title?: string | null
    quality?: EntQuality
    idempotencyKey?: string | null
    uploadedById: string
}

export interface EntInitiateResult {
    status: 200 | 201
    body: {
        uploadSessionId: string
        videoId: string
        r2Key: string
        partSize: number
        partsTotal: number
        parts: { partNumber: number; url: string }[]
        expiresAt: string
    }
}

/** Chỉ nhận video. Ảnh/tài liệu không có chỗ trong kho phim. */
function isAcceptedVideo(mimeType: string, fileName: string): boolean {
    const mime = (mimeType || '').toLowerCase().trim()
    if (VIDEO_MIME_ALLOWLIST.has(mime)) return true
    // MIME rỗng hoặc octet-stream (mkv trên Windows) ⇒ tin theo đuôi tệp.
    if (!mime || mime === 'application/octet-stream') {
        const ext = fileName.toLowerCase().split('.').pop() ?? ''
        return VIDEO_EXT_FALLBACK.has(ext)
    }
    return false
}

function partUrlsFor(r2Key: string, r2UploadId: string, partsTotal: number, mimeType: string) {
    if (!r2UploadId) {
        return presignPutObject(r2Key, mimeType).then((url) => [{ partNumber: 1, url }])
    }
    return Promise.all(
        Array.from({ length: partsTotal }, (_v, i) =>
            presignUploadPart(r2Key, r2UploadId, i + 1).then((url) => ({ partNumber: i + 1, url })),
        ),
    )
}

async function replayEntSession(sessionId: string): Promise<EntInitiateResult> {
    const session = await prisma.entUploadSession.findUnique({
        where: { id: sessionId },
        include: { video: true },
    })
    if (!session) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên tải lên.')
    if (session.abortedAt) fail(409, 'STATE_INVALID', 'Phiên tải lên đã bị hủy.')
    // URL ký lại từ đầu: phát lại thường xảy ra nhiều giờ sau, URL cũ có thể đã hết hạn.
    const parts = await partUrlsFor(session.r2Key, session.r2UploadId, session.partsTotal, session.video.mimeType)
    return {
        status: 200,
        body: {
            uploadSessionId: session.id,
            videoId: session.videoId,
            r2Key: session.r2Key,
            partSize: session.partSizeBytes,
            partsTotal: session.partsTotal,
            parts,
            expiresAt: session.expiresAt.toISOString(),
        },
    }
}

// ── initiate ─────────────────────────────────────────────────────────────────

export async function initiateEntUpload(input: EntInitiateInput): Promise<EntInitiateResult> {
    if (!input.fileName || input.fileName.length > 255) {
        fail(400, 'VALIDATION_ERROR', 'Tên tệp phải từ 1–255 ký tự.')
    }
    if (input.sizeBytes <= BigInt(0)) fail(400, 'VALIDATION_ERROR', 'Kích thước tệp không hợp lệ.')
    if (!isAcceptedVideo(input.mimeType, input.fileName)) {
        fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'Kho phim chỉ nhận tệp video.')
    }
    if (input.sizeBytes > ENT_VIDEO_MAX_BYTES) {
        fail(413, 'FILE_TOO_LARGE', 'Tệp vượt quá 32 GB.', { maxBytes: ENT_VIDEO_MAX_BYTES.toString() })
    }

    if (input.idempotencyKey) {
        const existing = await prisma.entUploadSession.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: { id: true },
        })
        if (existing) return replayEntSession(existing.id)
    }

    const partSize = computePartSize(input.sizeBytes)
    const partsTotal = computePartCount(input.sizeBytes, partSize)

    // Sinh id trước để dựng khoá R2 trong CÙNG một lần ghi — không để row nào tồn
    // tại với r2Key rỗng rồi vá bằng câu lệnh thứ hai (bài học ensureRootFolder).
    const videoId = randomUUID()
    const r2Key = entSourceKey(videoId, input.fileName)
    const title = (input.title?.trim() || titleFromFileName(input.fileName)).slice(0, ENT_TITLE_MAX)

    await prisma.entVideo.create({
        data: {
            id: videoId,
            title,
            fileName: input.fileName,
            mimeType: input.mimeType || 'video/mp4',
            sizeBytes: input.sizeBytes,
            muxQuality: input.quality === 'basic' ? 'basic' : 'plus',
            r2Key,
            uploadedById: input.uploadedById,
        },
    })

    const single = partsTotal <= 1
    let r2UploadId = ''
    if (!single) r2UploadId = await createMultipart(r2Key, input.mimeType)

    const expiresAt = new Date(Date.now() + ENT_UPLOAD_TTL_MS)
    try {
        const session = await prisma.entUploadSession.create({
            data: {
                videoId,
                idempotencyKey: input.idempotencyKey ?? null,
                r2Key,
                r2UploadId,
                partSizeBytes: partSize,
                partsTotal,
                expiresAt,
            },
        })
        const parts = await partUrlsFor(r2Key, r2UploadId, partsTotal, input.mimeType)
        reviewLog('info', 'ent.upload.initiate', {
            videoId, partsTotal, single, sizeBytes: input.sizeBytes.toString(), quality: input.quality ?? 'plus',
        })
        return {
            status: 201,
            body: {
                uploadSessionId: session.id,
                videoId,
                r2Key,
                partSize,
                partsTotal,
                parts,
                expiresAt: expiresAt.toISOString(),
            },
        }
    } catch (e) {
        // Hai yêu cầu cùng idempotencyKey chạy song song: dọn thứ vừa tạo rồi phát lại
        // phiên của người thắng — nếu không sẽ để lại một EntVideo mồ côi và một
        // multipart R2 không ai đóng (R2 vẫn tính tiền phần đã ghi).
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.idempotencyKey) {
            if (r2UploadId) await abortMultipart(r2Key, r2UploadId).catch(() => {})
            await prisma.entVideo.delete({ where: { id: videoId } }).catch(() => {})
            const winner = await prisma.entUploadSession.findUnique({
                where: { idempotencyKey: input.idempotencyKey },
                select: { id: true },
            })
            if (winner) return replayEntSession(winner.id)
        }
        throw e
    }
}

// ── complete ─────────────────────────────────────────────────────────────────

export interface EntCompleteResult {
    videoId: string
    pipelineStatus: ReviewPipelineStatus
}

export async function completeEntUpload(
    uploadSessionId: string,
    parts: { partNumber: number; etag: string }[],
): Promise<EntCompleteResult> {
    const session = await prisma.entUploadSession.findUnique({
        where: { id: uploadSessionId },
        include: { video: true },
    })
    if (!session) fail(404, 'NOT_FOUND', 'Không tìm thấy phiên tải lên.')
    const video = session.video

    if (session.abortedAt) fail(409, 'STATE_INVALID', 'Phiên tải lên đã bị hủy.')
    // Đã đi qua UPLOADING rồi ⇒ lần gọi này là retry mạng, trả lại trạng thái hiện có.
    if (video.pipelineStatus !== ReviewPipelineStatus.UPLOADING) {
        return { videoId: video.id, pipelineStatus: video.pipelineStatus }
    }
    if (session.expiresAt.getTime() < Date.now()) fail(410, 'UPLOAD_EXPIRED', 'Phiên tải lên đã hết hạn.')
    if (session.r2UploadId && !parts.length) fail(400, 'VALIDATION_ERROR', 'Thiếu danh sách part để hoàn tất.')

    // Claim nguyên tử: chỉ yêu cầu nào lật được UPLOADING→UPLOADED mới chạy finalize
    // trên R2. Chính hàng này là cái khoá mà abort tranh (abort lật sang FAILED).
    const claim = await prisma.entVideo.updateMany({
        where: { id: video.id, pipelineStatus: ReviewPipelineStatus.UPLOADING },
        data: { pipelineStatus: ReviewPipelineStatus.UPLOADED },
    })
    if (claim.count === 0) {
        const fresh = await prisma.entVideo.findUnique({ where: { id: video.id }, select: { pipelineStatus: true } })
        if (!fresh) fail(409, 'STATE_INVALID', 'Video đã bị gỡ.')
        return { videoId: video.id, pipelineStatus: fresh.pipelineStatus }
    }

    let r2Ok = true
    try {
        if (session.r2UploadId) {
            await completeMultipart(session.r2Key, session.r2UploadId, parts)
        } else {
            r2Ok = (await headObject(session.r2Key)) != null
        }
    } catch (e) {
        reviewLog('error', 'ent.upload.complete.r2_failed', { uploadSessionId, error: String(e) })
        await revertClaim(video.id)
        fail(502, 'UPSTREAM_ERROR', 'Không thể hoàn tất tải lên trên kho lưu trữ.', { provider: 'r2' })
    }
    if (!r2Ok) {
        await revertClaim(video.id)
        fail(400, 'VALIDATION_ERROR', 'Chưa nhận được nội dung tệp trên kho lưu trữ.')
    }

    // Byte THẬT: presigned PUT không ghim Content-Length nên số khai lúc initiate
    // chỉ là lời khai. Vượt trần ⇒ xoá vật thể + FAILED, không để R2 giữ 60 GB.
    const stored = await headObject(session.r2Key)
    if (stored && BigInt(stored.size) > ENT_VIDEO_MAX_BYTES) {
        await deleteObject(session.r2Key).catch(() => {})
        await prisma.entVideo
            .updateMany({
                where: { id: video.id },
                data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Tệp vượt quá dung lượng cho phép.' },
            })
            .catch(() => {})
        fail(413, 'FILE_TOO_LARGE', 'Tệp vượt quá dung lượng cho phép.', { maxBytes: ENT_VIDEO_MAX_BYTES.toString() })
    }

    await prisma.entUploadSession
        .update({ where: { id: session.id }, data: { completedAt: new Date(), partsDone: session.partsTotal } })
        .catch(() => {})

    // UPLOADED → PROCESSING rồi mới đẩy việc cho Inngest. Guard theo trạng thái để
    // hai lần complete song song không bắn hai lần tạo asset Mux (= trả tiền encode hai lần).
    const promoted = await prisma.entVideo.updateMany({
        where: { id: video.id, pipelineStatus: ReviewPipelineStatus.UPLOADED },
        data: {
            pipelineStatus: ReviewPipelineStatus.PROCESSING,
            uploadedAt: new Date(),
            ...(stored ? { sizeBytes: BigInt(stored.size) } : {}),
        },
    })
    if (promoted.count > 0) {
        await inngest.send({ name: ENT_EVENTS.UPLOAD_COMPLETED, data: { videoId: video.id } })
    }
    reviewLog('info', 'ent.upload.complete', { uploadSessionId, videoId: video.id })
    return { videoId: video.id, pipelineStatus: ReviewPipelineStatus.PROCESSING }
}

function revertClaim(videoId: string) {
    return prisma.entVideo
        .updateMany({
            where: { id: videoId, pipelineStatus: ReviewPipelineStatus.UPLOADED },
            data: { pipelineStatus: ReviewPipelineStatus.UPLOADING },
        })
        .catch(() => {})
}

// ── abort ────────────────────────────────────────────────────────────────────

export async function abortEntUpload(uploadSessionId: string): Promise<{ aborted: true }> {
    const session = await prisma.entUploadSession.findUnique({
        where: { id: uploadSessionId },
        include: { video: true },
    })
    if (!session) return { aborted: true } // idempotent
    if (session.completedAt) fail(409, 'STATE_INVALID', 'Phiên tải lên đã hoàn tất, không hủy được.')

    // Tranh cùng cái khoá với complete: chỉ hủy được khi còn UPLOADING.
    const claim = await prisma.entVideo.updateMany({
        where: { id: session.videoId, pipelineStatus: ReviewPipelineStatus.UPLOADING },
        data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Đã hủy tải lên.' },
    })
    if (claim.count === 0) return { aborted: true }

    if (session.r2UploadId) await abortMultipart(session.r2Key, session.r2UploadId).catch(() => {})
    await prisma.entUploadSession.update({ where: { id: session.id }, data: { abortedAt: new Date() } }).catch(() => {})
    // Bỏ hẳn bản ghi dở dang — người dùng huỷ thì không có lý do giữ một dòng FAILED
    // rỗng trong kho. Cascade dọn luôn phiên tải lên.
    await prisma.entVideo.delete({ where: { id: session.videoId } }).catch(() => {})
    reviewLog('info', 'ent.upload.abort', { uploadSessionId, videoId: session.videoId })
    return { aborted: true }
}

/** Janitor: đóng các phiên dở dang đã quá hạn (R2 vẫn tính tiền phần đã ghi). */
export async function expireEntInflightUpload(sessionId: string): Promise<'expired' | 'noop'> {
    const session = await prisma.entUploadSession.findUnique({ where: { id: sessionId } })
    if (!session || session.completedAt || session.abortedAt) return 'noop'
    try {
        await abortEntUpload(sessionId)
        return 'expired'
    } catch {
        return 'noop'
    }
}
