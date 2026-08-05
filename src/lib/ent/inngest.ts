// [Giải trí] Đường xử lý nền của kho phim: R2 → Mux → READY.
//
// Dùng CHUNG instance Inngest và bảng WebhookEvent với module Tệp, nhưng đi
// consumer riêng. Sợi dây phân biệt là `passthrough` của asset Mux: tiền tố
// `ent:` (xem events.ts). Route webhook chọn nhánh theo tiền tố đó.
//
// BỎ so với bản của Tệp: bước gắn lại thẻ màu BT.709 bằng ffmpeg. Đó là bước
// mong manh nhất cả đường ống, sinh ra để chữa video xuất từ editor thiếu thẻ
// màu; phim thương mại gần như luôn có sẵn.

import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { inngest, REVIEW_EVENTS } from '@/lib/review/inngest'
import { reviewLog } from '@/lib/review/logger'
import { getObjectRange, presignGetObject, deleteObject, headObject } from '@/lib/review/r2'
import { looksLikeMedia } from '@/lib/review/upload-helpers'
import { createMuxAsset, getMuxAsset, deleteMuxAsset, extractReadyMeta, MuxError, type MuxAsset } from '@/lib/review/mux'
import { ENT_EVENTS, entPassthrough, parseEntPassthrough } from './events'
import { expireEntInflightUpload } from './upload-service'

const STALE_MS = 24 * 60 * 60 * 1000

// ── áp kết quả từ Mux ────────────────────────────────────────────────────────

type ApplyOutcome = 'applied' | 'noop' | 'gone' | 'unexpected'

async function applyEntReady(videoId: string, asset: MuxAsset): Promise<ApplyOutcome> {
    const meta = extractReadyMeta(asset)
    const cur = await prisma.entVideo.findUnique({
        where: { id: videoId },
        select: { pipelineStatus: true, durationMs: true },
    })
    if (!cur) return 'gone'
    if (cur.pipelineStatus === ReviewPipelineStatus.READY) return 'noop'
    if (cur.pipelineStatus !== ReviewPipelineStatus.PROCESSING) return 'unexpected'

    // Ảnh bìa mặc định lấy ở mốc 10% thời lượng — giây 0 của phim thường là màn đen.
    const posterTime = meta.durationMs ? Math.max(1, Math.round((meta.durationMs / 1000) * 0.1)) : null

    const res = await prisma.entVideo.updateMany({
        where: { id: videoId, pipelineStatus: ReviewPipelineStatus.PROCESSING },
        data: {
            pipelineStatus: ReviewPipelineStatus.READY,
            readyAt: new Date(),
            errorMessage: null,
            // asset.id chứ không phải meta — extractReadyMeta cố ý không trả assetId
            // (module Tệp đã lưu nó từ bước store-mux-id). Ở đây ghi lại cho chắc:
            // webhook có thể tới trước khi bước đó kịp chạy xong.
            muxAssetId: asset.id ?? undefined,
            muxPlaybackId: meta.muxPlaybackId ?? undefined,
            durationMs: meta.durationMs ?? undefined,
            width: meta.width ?? undefined,
            height: meta.height ?? undefined,
            ...(posterTime != null ? { posterTime } : {}),
        },
    })
    return res.count > 0 ? 'applied' : 'noop'
}

async function applyEntErrored(videoId: string, message: string): Promise<ApplyOutcome> {
    const res = await prisma.entVideo.updateMany({
        where: { id: videoId, pipelineStatus: { in: [ReviewPipelineStatus.PROCESSING, ReviewPipelineStatus.UPLOADED] } },
        data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: message.slice(0, 500) },
    })
    if (res.count > 0) return 'applied'
    const exists = await prisma.entVideo.count({ where: { id: videoId } })
    return exists ? 'noop' : 'gone'
}

// ── consumer webhook Mux ─────────────────────────────────────────────────────

export const entMuxWebhook = inngest.createFunction(
    { id: 'ent-mux-webhook', retries: 4, triggers: [{ event: ENT_EVENTS.MUX_EVENT_RECEIVED }] },
    async ({ event, step }) => {
        const webhookEventId = event.data?.webhookEventId as string | undefined
        if (!webhookEventId) return { skipped: true }

        const ledger = await step.run('load-event', async () => {
            const row = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } })
            if (!row) return { missing: true as const }
            return {
                missing: false as const,
                alreadyProcessed: row.processedAt != null,
                type: (row.payload as { type?: string } | null)?.type ?? row.type,
                asset: ((row.payload as { data?: MuxAsset } | null)?.data ?? null) as MuxAsset | null,
            }
        })
        if (ledger.missing) {
            reviewLog('warn', 'ent.mux_webhook.ledger_missing', { webhookEventId })
            return { skipped: true }
        }
        if (ledger.alreadyProcessed) return { duplicate: true }

        const isReady = ledger.type === 'video.asset.ready'
        const isErrored = ledger.type === 'video.asset.errored'
        const videoId = parseEntPassthrough(ledger.asset?.passthrough)

        if ((isReady || isErrored) && videoId) {
            await step.run('apply', async () => {
                if (isReady) {
                    const outcome = await applyEntReady(videoId, ledger.asset as MuxAsset)
                    if (outcome === 'gone') {
                        // Phim đã bị gỡ trong lúc Mux xử lý — nuốt sự kiện, không retry.
                        reviewLog('warn', 'ent.mux_webhook.video_missing', { webhookEventId, videoId })
                        return { orphan: true }
                    }
                    // Trạng thái lạ (webhook đến sớm / tiến trình chết giữa chừng): ĐỪNG để
                    // mark-processed nuốt mất, ném ra cho Inngest thử lại; janitor đêm đỡ tiếp.
                    if (outcome === 'unexpected') {
                        throw new Error(`ready webhook cho video ${videoId} không ở PROCESSING — retry`)
                    }
                    return { applied: outcome }
                }
                const msg = (ledger.asset as MuxAsset).errors?.messages?.join('; ') || 'Mux xử lý video thất bại.'
                const outcome = await applyEntErrored(videoId, msg)
                reviewLog('warn', 'ent.mux_webhook.errored', { videoId, msg, outcome })
                return { applied: outcome }
            })
        } else {
            reviewLog('info', 'ent.mux_webhook.ignored', { webhookEventId, type: ledger.type })
        }

        // Đánh dấu đã xử lý SAU CÙNG, để hỏng giữa chừng thì còn được thử lại.
        await step.run('mark-processed', async () => {
            await prisma.webhookEvent.updateMany({
                where: { id: webhookEventId, processedAt: null },
                data: { processedAt: new Date() },
            })
            return true
        })
        return { processed: true, type: ledger.type }
    },
)

// ── tạo asset Mux sau khi byte đã nằm trên R2 ────────────────────────────────

export const entProcessUpload = inngest.createFunction(
    { id: 'ent-process-upload', retries: 4, triggers: [{ event: ENT_EVENTS.UPLOAD_COMPLETED }] },
    async ({ event, step }) => {
        const videoId = event.data?.videoId as string | undefined
        if (!videoId) return { skipped: true }

        const v = await step.run('load-video', () =>
            prisma.entVideo.findUnique({
                where: { id: videoId },
                select: { pipelineStatus: true, r2Key: true, muxAssetId: true, muxQuality: true },
            }),
        )
        if (!v) return { skipped: true }
        // Idempotent: chạy lại sau khi đã có muxAssetId thì bỏ qua — không trả tiền encode hai lần.
        if (v.pipelineStatus !== ReviewPipelineStatus.PROCESSING || v.muxAssetId || !v.r2Key) {
            reviewLog('info', 'ent.process_upload.noop', { videoId, status: v.pipelineStatus, hasMux: !!v.muxAssetId })
            return { skipped: true }
        }

        // Chốt nội dung rẻ tiền: loại tệp text đổi đuôi .mp4 trước khi trả tiền cho Mux.
        const looksVideo = await step.run('verify-content', async () => {
            try {
                return looksLikeMedia('VIDEO', await getObjectRange(v.r2Key as string, 0, 4095))
            } catch (e) {
                // Không đọc được vật thể ⇒ để Mux làm cửa thật, đừng tự chặn oan.
                reviewLog('warn', 'ent.process_upload.head_failed', { videoId, error: String(e) })
                return true
            }
        })
        if (!looksVideo) {
            await step.run('reject-content', async () => {
                await prisma.entVideo.updateMany({
                    where: { id: videoId, pipelineStatus: ReviewPipelineStatus.PROCESSING },
                    data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Nội dung tệp không phải video hợp lệ.' },
                })
                return true
            })
            return { rejected: true }
        }

        const created = await step.run('create-mux-asset', async () => {
            const cur = await prisma.entVideo.findUnique({ where: { id: videoId }, select: { muxAssetId: true } })
            if (cur?.muxAssetId) return { assetId: cur.muxAssetId, mine: false }
            const inputUrl = await presignGetObject(v.r2Key as string, { expiresIn: 24 * 60 * 60 })
            const asset = await createMuxAsset({
                inputUrl,
                passthrough: entPassthrough(videoId),
                videoQuality: v.muxQuality === 'basic' ? 'basic' : 'plus',
            })
            return { assetId: asset.id, mine: true }
        })

        if (created.mine) {
            await step.run('store-mux-id', async () => {
                const res = await prisma.entVideo.updateMany({
                    where: { id: videoId, pipelineStatus: ReviewPipelineStatus.PROCESSING, muxAssetId: null },
                    data: { muxAssetId: created.assetId },
                })
                if (res.count === 0) {
                    // Guard trượt vì một trong hai: (i) lượt chạy song song đã lưu asset KHÁC
                    // ⇒ asset của ta mồ côi, xoá đi kẻo trả tiền lưu trữ mãi; (ii) webhook ready
                    // đến rất nhanh đã lưu CHÍNH asset này ⇒ nó đang sống, không được xoá.
                    const cur = await prisma.entVideo.findUnique({ where: { id: videoId }, select: { muxAssetId: true } })
                    if (cur?.muxAssetId !== created.assetId) {
                        reviewLog('warn', 'ent.process_upload.duplicate_asset', { videoId, muxAssetId: created.assetId })
                        await deleteMuxAsset(created.assetId).catch(() => {})
                    }
                }
                return res.count
            })
        }
        reviewLog('info', 'ent.process_upload.created', { videoId, muxAssetId: created.assetId, mine: created.mine })
        return { muxAssetId: created.assetId }
    },
)

// ── janitor ──────────────────────────────────────────────────────────────────

/** Một phim kẹt PROCESSING: hỏi thẳng Mux rồi áp đúng chuyển trạng thái webhook sẽ làm. */
async function reconcileEntVideo(videoId: string, muxAssetId: string | null, stale: boolean): Promise<string> {
    if (!muxAssetId) {
        if (stale) {
            await applyEntErrored(videoId, 'Không thể khởi tạo xử lý video (quá thời gian).')
            return 'create-timeout-failed'
        }
        await inngest.send({ name: ENT_EVENTS.UPLOAD_COMPLETED, data: { videoId } })
        return 're-enqueued-create'
    }
    let asset: MuxAsset
    try {
        asset = await getMuxAsset(muxAssetId)
    } catch (e) {
        if (e instanceof MuxError && e.status === 404) {
            await applyEntErrored(videoId, 'Mux không còn asset cho phim này.')
            return 'mux-404-failed'
        }
        return 'mux-get-error'
    }
    if (asset.status === 'ready') return `ready-${await applyEntReady(videoId, asset)}`
    if (asset.status === 'errored') {
        return `errored-${await applyEntErrored(videoId, asset.errors?.messages?.join('; ') || 'Mux xử lý video thất bại.')}`
    }
    // Còn 'preparing'. Quá 24h thì Mux đã kẹt thật — bỏ cuộc và xoá asset (vẫn tính tiền).
    if (stale) {
        await applyEntErrored(videoId, 'Mux xử lý quá lâu (>24h).')
        await deleteMuxAsset(muxAssetId).catch(() => {})
        return 'preparing-timeout-failed'
    }
    return 'preparing'
}

/**
 * Bám CHUNG sự kiện janitor của module Tệp (cron `0 20 * * *` gọi
 * /api/cron/review-janitor). Inngest cho nhiều hàm nghe cùng một sự kiện, nên
 * không phải thêm cron mới vào vercel.json — một lịch chạy, hai người dọn.
 */
export const entJanitor = inngest.createFunction(
    { id: 'ent-janitor', retries: 2, triggers: [{ event: REVIEW_EVENTS.JANITOR_REQUESTED }] },
    async ({ step }) => {
        // (a) Phiên tải lên dở dang quá hạn — R2 vẫn tính tiền phần đã ghi của multipart bỏ rơi.
        // [rà soát 05/08] Lọc thêm theo trạng thái video: abortEntUpload chỉ huỷ được
        // phiên của video còn UPLOADING. Không lọc thì các phiên "xác sống" (video đã
        // FAILED/READY nhưng phiên chưa đóng sổ) quay lại mỗi đêm, ăn hết hạn ngạch 50
        // và multipart THẬT không bao giờ tới lượt được dọn.
        const expired = await step.run('expire-sessions', async () => {
            const rows = await prisma.entUploadSession.findMany({
                where: {
                    completedAt: null,
                    abortedAt: null,
                    expiresAt: { lt: new Date() },
                    video: { pipelineStatus: ReviewPipelineStatus.UPLOADING },
                },
                select: { id: true },
                take: 50,
            })
            let n = 0
            for (const r of rows) {
                // try/catch TỪNG phần tử: một hàng hỏng không được giết cả lượt chạy,
                // nếu không các bước sau (b)(c) sẽ không bao giờ tới lượt.
                try {
                    if ((await expireEntInflightUpload(r.id)) === 'expired') n++
                } catch (e) {
                    reviewLog('warn', 'ent.janitor.expire_failed', { sessionId: r.id, error: String(e) })
                }
            }
            return n
        })

        // (b) Phim kẹt PROCESSING — webhook Mux rơi mất thì đây là lưới đỡ.
        // Chừa 15 phút ân hạn: phim vừa vào PROCESSING vài giây mà bị bắn thêm một
        // lượt UPLOAD_COMPLETED sẽ tạo asset Mux THỨ HAI ⇒ trả tiền encode hai lần.
        const reconciled = await step.run('reconcile-processing', async () => {
            const rows = await prisma.entVideo.findMany({
                where: {
                    pipelineStatus: ReviewPipelineStatus.PROCESSING,
                    updatedAt: { lt: new Date(Date.now() - 15 * 60_000) },
                },
                select: { id: true, muxAssetId: true, updatedAt: true },
                take: 50,
            })
            const out: Record<string, string> = {}
            for (const r of rows) {
                try {
                    out[r.id] = await reconcileEntVideo(r.id, r.muxAssetId, Date.now() - r.updatedAt.getTime() > STALE_MS)
                } catch (e) {
                    out[r.id] = 'error'
                    reviewLog('warn', 'ent.janitor.reconcile_failed', { videoId: r.id, error: String(e) })
                }
            }
            return out
        })

        // (c) Kẹt ở UPLOADED (byte đã lên R2 nhưng chưa ai đẩy sang PROCESSING) — bơm lại.
        const redriven = await step.run('redrive-uploaded', async () => {
            const rows = await prisma.entVideo.findMany({
                where: { pipelineStatus: ReviewPipelineStatus.UPLOADED, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
                select: { id: true, r2Key: true },
                take: 50,
            })
            let n = 0
            for (const r of rows) {
                try {
                    // Kiểm vật thể CÓ THẬT trên R2 trước khi giao cho Mux — giao một URL
                    // 404 thì Mux vẫn nhận việc, vẫn tính công, rồi mới báo lỗi.
                    if (!r.r2Key || !(await headObject(r.r2Key))) {
                        await prisma.entVideo.updateMany({
                            where: { id: r.id, pipelineStatus: ReviewPipelineStatus.UPLOADED },
                            data: {
                                pipelineStatus: ReviewPipelineStatus.FAILED,
                                errorMessage: 'Không tìm thấy tệp gốc trên kho lưu trữ.',
                            },
                        })
                        continue
                    }
                    const flip = await prisma.entVideo.updateMany({
                        where: { id: r.id, pipelineStatus: ReviewPipelineStatus.UPLOADED },
                        data: { pipelineStatus: ReviewPipelineStatus.PROCESSING },
                    })
                    if (flip.count > 0) {
                        await inngest.send({ name: ENT_EVENTS.UPLOAD_COMPLETED, data: { videoId: r.id } })
                        n++
                    }
                } catch (e) {
                    reviewLog('warn', 'ent.janitor.redrive_failed', { videoId: r.id, error: String(e) })
                }
            }
            return n
        })

        reviewLog('info', 'ent.janitor.done', { expired, redriven, reconciled: Object.keys(reconciled).length })
        return { expired, redriven, reconciled }
    },
)

/** Dọn sạch dấu vết ngoài DB của một phim (Mux asset + vật thể R2). */
/**
 * Trả về danh sách thứ KHÔNG xoá được, để người gọi quyết định có nên xoá hàng DB
 * hay không. [rà soát 05/08] Trước đây nuốt mọi lỗi rồi vẫn xoá hàng ⇒ asset Mux
 * và vật thể R2 mồ côi, TÍNH TIỀN MÃI mà không còn khoá nào trong DB tìm ra nó.
 */
export async function teardownEntVideoExternal(v: {
    muxAssetId: string | null
    r2Key: string | null
    subtitleKeys: string[]
}): Promise<{ failed: string[] }> {
    const failed: string[] = []
    if (v.muxAssetId) {
        try {
            await deleteMuxAsset(v.muxAssetId)
        } catch (e) {
            failed.push(`mux:${v.muxAssetId}`)
            reviewLog('error', 'ent.teardown.mux_failed', { muxAssetId: v.muxAssetId, error: String(e) })
        }
    }
    for (const key of [v.r2Key, ...v.subtitleKeys].filter((k): k is string => !!k)) {
        try {
            await deleteObject(key)
        } catch (e) {
            failed.push(`r2:${key}`)
            reviewLog('error', 'ent.teardown.r2_failed', { key, error: String(e) })
        }
    }
    return { failed }
}

export const entFunctions = [entMuxWebhook, entProcessUpload, entJanitor]
