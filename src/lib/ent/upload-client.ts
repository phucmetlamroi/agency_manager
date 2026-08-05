'use client'

// [Giải trí] Bộ tải phim lên phía trình duyệt.
//
// KHÔNG fork upload-engine.ts của module Tệp (1100 dòng, dính store + mô hình
// thư mục/asset/task và chốt bảo trì). Ở đây chỉ cần: một hàng đợi phẳng, part
// song song, thử lại có backoff, huỷ được. Các hàm THUẦN đã kiểm chứng thì import
// thẳng từ engine cũ — planParts, computeBackoffMs, isRetryableStatus,
// computeBytesUploaded, nextSpeedEma — không chép lại.
//
// ─── SỬA SAU RÀ SOÁT 05/08/2026 ─────────────────────────────────────────────
// Bốn lỗi làm hỏng trải nghiệm up phim lớn, đều đã vá ở file này:
//
// 1. MẤT TRẮNG KHI MẠNG CHỚP. Trước: một part hỏng cứng ⇒ ném ⇒ bấm "Thử lại"
//    up lại từ byte 0. Phim 20 GB đứt ở phút thứ 40 là mất cả 40 phút.
//    Nay: etag của part đã xong được GIỮ trong bộ nhớ theo phiên; thử lại chỉ
//    up những part còn thiếu.
// 2. WORKER MA. Trước: Promise.all reject ở part hỏng nhưng 5 worker còn lại
//    KHÔNG bị huỷ — vẫn lặng lẽ đẩy hết phim lên trong khi giao diện đã báo lỗi
//    (tốn băng thông của người dùng và tiền ghi của R2).
//    Nay: có AbortController nội bộ, hỏng một part là dừng cả nhóm.
// 3. URL HẾT HẠN (403) LÀ CHẾT. URL ký sống 24h; phim lớn trên mạng chậm vượt
//    quá là hỏng. Nay 403 ⇒ gọi lại initiate (cùng idempotencyKey) để lấy URL
//    mới rồi đi tiếp, tối đa 2 lần.
// 4. HUỶ KHÔNG BÁO MÁY CHỦ. Nay gọi /abort để R2 đóng multipart ngay, thay vì
//    để nó treo tới khi cron dọn (R2 tính tiền phần đã ghi).

import {
    planParts,
    computeBackoffMs,
    isRetryableStatus,
    computeBytesUploaded,
    nextSpeedEma,
    MAX_PART_ATTEMPTS,
    PART_STALL_TIMEOUT_MS,
    type PartPlan,
} from '@/lib/review/upload-engine'

const PARTS_IN_PARALLEL = 6
const MAX_URL_REFRESH = 2
/** Không báo tiến độ quá 10 lần/giây — 6 part × mỗi sự kiện progress là ~100 lần render/giây. */
const PROGRESS_THROTTLE_MS = 100

export type EntUploadPhase = 'queued' | 'uploading' | 'finishing' | 'processing' | 'failed' | 'canceled'

export interface EntUploadItem {
    id: string
    file: File
    title: string
    quality: 'basic' | 'plus'
    phase: EntUploadPhase
    /** 0–1 */
    progress: number
    /** byte/giây, null khi chưa đo được */
    speed: number | null
    error: string | null
    videoId: string | null
    /** Phiên trên máy chủ — giữ lại để huỷ đúng phiên. */
    sessionId: string | null
}

interface InitiateResponse {
    uploadSessionId: string
    videoId: string
    partSize: number
    partsTotal: number
    parts: { partNumber: number; url: string }[]
}

/**
 * Phần đã hoàn tất của một lần up, giữ NGOÀI React state để "Thử lại" tiếp tục
 * được thay vì bắt đầu lại từ đầu. Khoá theo id của item.
 */
const doneParts = new Map<string, Map<number, string>>()

export function clearUploadMemory(itemId: string) {
    doneParts.delete(itemId)
}

async function readError(res: Response): Promise<string> {
    try {
        const body = await res.json()
        return body?.error?.message ?? `Lỗi ${res.status}`
    } catch {
        return `Lỗi ${res.status}`
    }
}

class PartHttpError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message)
    }
}

/** PUT một part và trả ETag. Tiến độ báo về qua onProgress để tính tốc độ thật. */
function putPart(
    url: string,
    blob: Blob,
    signal: AbortSignal,
    onProgress: (loaded: number) => void,
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
        }
        const xhr = new XMLHttpRequest()
        let lastTick = Date.now()
        let settled = false

        // Canh treo: R2 thỉnh thoảng nhận kết nối rồi im lặng. Không có canh này thì
        // một part chết làm cả lần up đứng vĩnh viễn mà không báo gì.
        const stall = setInterval(() => {
            if (Date.now() - lastTick > PART_STALL_TIMEOUT_MS) {
                // cleanup TRƯỚC khi abort: xhr.abort() không kích onerror/onload nên
                // interval sẽ không bao giờ được dọn nếu cleanup nằm sau.
                finish(() => reject(new PartHttpError('Kết nối đứng quá lâu.', 0)))
            }
        }, 5_000)

        const cleanup = () => {
            clearInterval(stall)
            signal.removeEventListener('abort', onAbort)
        }
        const finish = (fn: () => void) => {
            if (settled) return
            settled = true
            cleanup()
            try {
                xhr.abort()
            } catch {
                /* đã xong rồi */
            }
            fn()
        }
        const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
        signal.addEventListener('abort', onAbort)

        xhr.upload.onprogress = (e) => {
            lastTick = Date.now()
            onProgress(e.loaded)
        }
        xhr.onload = () => {
            if (settled) return
            settled = true
            cleanup()
            if (xhr.status >= 200 && xhr.status < 300) {
                // ETag chỉ đọc được khi R2 CORS khai ExposeHeaders: ["ETag"].
                const etag = xhr.getResponseHeader('ETag')
                if (!etag) {
                    // KHÔNG phải lỗi tạm thời — thử lại 5 lần cũng thế. Báo thẳng
                    // để chủ hệ thống biết sửa cấu hình CORS của R2.
                    reject(new PartHttpError('R2 chưa mở ExposeHeaders ["ETag"] — hãy sửa cấu hình CORS của bucket.', -1))
                    return
                }
                resolve(etag)
            } else {
                reject(new PartHttpError(`R2 trả ${xhr.status}`, xhr.status))
            }
        }
        xhr.onerror = () => {
            if (settled) return
            settled = true
            cleanup()
            reject(new PartHttpError('Lỗi mạng khi tải part.', 0))
        }
        xhr.open('PUT', url)
        xhr.send(blob)
    })
}

export interface EntUploadCallbacks {
    onUpdate: (patch: Partial<EntUploadItem>) => void
}

async function callInitiate(item: EntUploadItem, signal: AbortSignal): Promise<InitiateResponse> {
    const res = await fetch('/api/ent/uploads/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
            fileName: item.file.name,
            sizeBytes: String(item.file.size),
            mimeType: item.file.type || 'application/octet-stream',
            title: item.title,
            quality: item.quality,
            idempotencyKey: item.id,
        }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

/**
 * Chạy trọn một lần tải phim: initiate → PUT các part song song → complete.
 * Ném lỗi nếu hỏng; người gọi bắt và ghi vào `error`.
 */
export async function runEntUpload(
    item: EntUploadItem,
    outerSignal: AbortSignal,
    cb: EntUploadCallbacks,
): Promise<void> {
    cb.onUpdate({ phase: 'uploading', progress: 0, error: null })

    // Bộ điều khiển NỘI BỘ: hỏng một part thì huỷ luôn các worker còn lại.
    // Không có nó thì 5 worker kia vẫn đẩy hết phim trong khi giao diện báo lỗi.
    const ctrl = new AbortController()
    const relayAbort = () => ctrl.abort()
    outerSignal.addEventListener('abort', relayAbort)
    const signal = ctrl.signal

    try {
        let init = await callInitiate(item, signal)
        cb.onUpdate({ videoId: init.videoId, sessionId: init.uploadSessionId })

        const plan = planParts(item.file.size, init.partSize)
        let urlByPart = new Map(init.parts.map((p) => [p.partNumber, p.url]))

        // Phần đã xong từ lần chạy trước (nếu đây là "Thử lại").
        const done = doneParts.get(item.id) ?? new Map<number, string>()
        doneParts.set(item.id, done)

        const doneSet = new Set(done.keys())
        const inflight = new Map<number, number>()
        let urlRefreshes = 0

        let lastBytes = 0
        let lastAt = Date.now()
        let lastReport = 0
        let speed: number | null = null
        const report = (force = false) => {
            const now = Date.now()
            if (!force && now - lastReport < PROGRESS_THROTTLE_MS) return
            lastReport = now
            const bytes = computeBytesUploaded(plan, doneSet, inflight, item.file.size)
            speed = nextSpeedEma(speed, bytes - lastBytes, now - lastAt)
            lastBytes = bytes
            lastAt = now
            cb.onUpdate({ progress: item.file.size ? bytes / item.file.size : 0, speed })
        }
        report(true)

        /** Xin lại bộ URL ký mới (URL cũ sống 24h; phim lớn có thể vượt). */
        const refreshUrls = async (): Promise<boolean> => {
            if (urlRefreshes >= MAX_URL_REFRESH) return false
            urlRefreshes++
            init = await callInitiate(item, signal)
            urlByPart = new Map(init.parts.map((p) => [p.partNumber, p.url]))
            return true
        }

        const uploadOne = async (part: PartPlan) => {
            if (done.has(part.partNumber)) return // đã xong ở lần chạy trước
            for (let attempt = 0; ; attempt++) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
                const url = urlByPart.get(part.partNumber)
                if (!url) throw new Error(`Thiếu URL cho phần ${part.partNumber}.`)
                try {
                    inflight.set(part.partNumber, 0)
                    const etag = await putPart(url, item.file.slice(part.start, part.end), signal, (loaded) => {
                        inflight.set(part.partNumber, loaded)
                        report()
                    })
                    inflight.delete(part.partNumber)
                    done.set(part.partNumber, etag)
                    doneSet.add(part.partNumber)
                    report(true)
                    return
                } catch (e) {
                    inflight.delete(part.partNumber)
                    if (signal.aborted) throw e
                    const status = e instanceof PartHttpError ? e.status : 0
                    // -1 = lỗi cấu hình, thử lại vô ích.
                    if (status === -1) throw e
                    // 403 = URL ký hết hạn ⇒ xin bộ mới rồi thử lại NGAY, không tính lượt.
                    if (status === 403 && (await refreshUrls())) {
                        attempt--
                        continue
                    }
                    const retryable = status === 0 || isRetryableStatus(status)
                    if (!retryable || attempt + 1 >= MAX_PART_ATTEMPTS) throw e
                    await new Promise((r) => setTimeout(r, computeBackoffMs(attempt)))
                }
            }
        }

        // Bể công nhân: mỗi luồng rút part kế tiếp khi rảnh — nhanh hơn chia lô cố
        // định vì part cuối (thường nhỏ hơn) không bắt cả nhóm phải chờ.
        // Hỏng một part ⇒ ctrl.abort() ⇒ mọi worker dừng ngay.
        const queue = plan.filter((p) => !done.has(p.partNumber))
        let firstError: unknown = null
        const workers = Array.from({ length: Math.min(PARTS_IN_PARALLEL, queue.length) }, async () => {
            for (;;) {
                const part = queue.shift()
                if (!part) return
                try {
                    await uploadOne(part)
                } catch (e) {
                    if (!firstError) {
                        firstError = e
                        ctrl.abort()
                    }
                    return
                }
            }
        })
        await Promise.all(workers)
        if (firstError) throw firstError

        cb.onUpdate({ phase: 'finishing', progress: 1 })

        // Chốt: KHÔNG dùng outerSignal ở đây. Người dùng bấm X đúng lúc này mà huỷ
        // thì phim đã nằm 100% trên R2 nhưng không bao giờ được finalize.
        const completeRes = await fetch(`/api/ent/uploads/${init.uploadSessionId}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                parts: init.partsTotal > 1 ? [...done.entries()].map(([partNumber, etag]) => ({ partNumber, etag })) : [],
            }),
        })
        if (!completeRes.ok) throw new Error(await readError(completeRes))

        clearUploadMemory(item.id)
        // Từ đây Mux xử lý — người dùng theo dõi tiếp bằng badge trạng thái trong kho.
        cb.onUpdate({ phase: 'processing', speed: null })
    } finally {
        outerSignal.removeEventListener('abort', relayAbort)
    }
}

/** Báo máy chủ đóng multipart — R2 tính tiền phần đã ghi cho tới khi được đóng. */
export async function abortEntUploadOnServer(sessionId: string): Promise<void> {
    try {
        await fetch(`/api/ent/uploads/${sessionId}/abort`, { method: 'POST' })
    } catch {
        /* cron dọn dẹp sẽ lo nốt */
    }
}
