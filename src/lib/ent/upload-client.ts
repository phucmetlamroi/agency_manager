'use client'

// [Giải trí] Bộ tải phim lên phía trình duyệt.
//
// KHÔNG fork upload-engine.ts của module Tệp (1100 dòng, dính chặt store + mô hình
// thư mục/asset/task và chốt bảo trì). Ở đây chỉ cần: một hàng đợi phẳng, part
// song song, thử lại có backoff, huỷ được. Các hàm THUẦN đã kiểm chứng thì import
// thẳng từ engine cũ — planParts, computeBackoffMs, isRetryableStatus,
// computeBytesUploaded, nextSpeedEma — không chép lại.
//
// Tốc độ: 6 part chạy song song (module Tệp để 4 vì còn phải chia băng thông cho
// nhiều tệp cùng lúc; kho phim thường up từng phim một nên đẩy cao hơn được).

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

export type EntUploadPhase = 'queued' | 'uploading' | 'finishing' | 'processing' | 'done' | 'failed' | 'canceled'

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
}

interface InitiateResponse {
    uploadSessionId: string
    videoId: string
    partSize: number
    partsTotal: number
    parts: { partNumber: number; url: string }[]
}

async function readError(res: Response): Promise<string> {
    try {
        const body = await res.json()
        return body?.error?.message ?? `Lỗi ${res.status}`
    } catch {
        return `Lỗi ${res.status}`
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
        const xhr = new XMLHttpRequest()
        let lastTick = Date.now()

        // Canh treo: R2 thỉnh thoảng nhận kết nối rồi im lặng. Không có canh này thì
        // một part chết làm cả lần up đứng vĩnh viễn mà không báo gì.
        const stall = setInterval(() => {
            if (Date.now() - lastTick > PART_STALL_TIMEOUT_MS) {
                xhr.abort()
                reject(new Error('Kết nối đứng quá lâu.'))
            }
        }, 5_000)

        const cleanup = () => {
            clearInterval(stall)
            signal.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
            xhr.abort()
            cleanup()
            reject(new DOMException('Aborted', 'AbortError'))
        }
        signal.addEventListener('abort', onAbort)

        xhr.upload.onprogress = (e) => {
            lastTick = Date.now()
            onProgress(e.loaded)
        }
        xhr.onload = () => {
            cleanup()
            if (xhr.status >= 200 && xhr.status < 300) {
                // ETag chỉ đọc được khi R2 CORS khai ExposeHeaders: ["ETag"].
                const etag = xhr.getResponseHeader('ETag')
                if (!etag) {
                    reject(new Error('Không đọc được ETag của part (kiểm tra CORS R2).'))
                    return
                }
                resolve(etag)
            } else {
                const err = new Error(`R2 trả ${xhr.status}`) as Error & { status?: number }
                err.status = xhr.status
                reject(err)
            }
        }
        xhr.onerror = () => {
            cleanup()
            const err = new Error('Lỗi mạng khi tải part.') as Error & { status?: number }
            err.status = 0
            reject(err)
        }
        xhr.open('PUT', url)
        xhr.send(blob)
    })
}

export interface EntUploadCallbacks {
    onUpdate: (patch: Partial<EntUploadItem>) => void
}

/**
 * Chạy trọn một lần tải phim: initiate → PUT các part song song → complete.
 * Ném lỗi nếu hỏng; người gọi bắt và ghi vào `error`.
 */
export async function runEntUpload(
    item: EntUploadItem,
    signal: AbortSignal,
    cb: EntUploadCallbacks,
): Promise<void> {
    cb.onUpdate({ phase: 'uploading', progress: 0, error: null })

    // idempotencyKey ổn định theo tệp: bấm lại "Thử lại" sẽ tiếp tục phiên cũ thay
    // vì tạo bản ghi mới + multipart mới (R2 tính tiền phần đã ghi của multipart bỏ rơi).
    const idempotencyKey = `${item.id}`

    const initRes = await fetch('/api/ent/uploads/initiate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({
            fileName: item.file.name,
            sizeBytes: String(item.file.size),
            mimeType: item.file.type || 'application/octet-stream',
            title: item.title,
            quality: item.quality,
            idempotencyKey,
        }),
    })
    if (!initRes.ok) throw new Error(await readError(initRes))
    const init: InitiateResponse = await initRes.json()
    cb.onUpdate({ videoId: init.videoId })

    const plan = planParts(item.file.size, init.partSize)
    const urlByPart = new Map(init.parts.map((p) => [p.partNumber, p.url]))
    const done = new Set<number>()
    const inflight = new Map<number, number>()
    const etags: { partNumber: number; etag: string }[] = []

    let lastBytes = 0
    let lastAt = Date.now()
    let speed: number | null = null
    const report = () => {
        const bytes = computeBytesUploaded(plan, done, inflight, item.file.size)
        const now = Date.now()
        speed = nextSpeedEma(speed, bytes - lastBytes, now - lastAt)
        lastBytes = bytes
        lastAt = now
        cb.onUpdate({ progress: item.file.size ? bytes / item.file.size : 0, speed })
    }

    const uploadOne = async (part: PartPlan) => {
        const url = urlByPart.get(part.partNumber)
        if (!url) throw new Error(`Thiếu URL cho part ${part.partNumber}.`)
        for (let attempt = 0; ; attempt++) {
            try {
                inflight.set(part.partNumber, 0)
                const etag = await putPart(url, item.file.slice(part.start, part.end), signal, (loaded) => {
                    inflight.set(part.partNumber, loaded)
                    report()
                })
                inflight.delete(part.partNumber)
                done.add(part.partNumber)
                etags.push({ partNumber: part.partNumber, etag })
                report()
                return
            } catch (e) {
                inflight.delete(part.partNumber)
                if (signal.aborted) throw e
                const status = (e as { status?: number }).status ?? 0
                const retryable = status === 0 || isRetryableStatus(status)
                if (!retryable || attempt + 1 >= MAX_PART_ATTEMPTS) throw e
                await new Promise((r) => setTimeout(r, computeBackoffMs(attempt)))
            }
        }
    }

    // Bể công nhân: mỗi luồng rút part kế tiếp khi rảnh — nhanh hơn chia lô cố định
    // vì part cuối (thường nhỏ hơn) không bắt cả nhóm phải chờ.
    const queue = [...plan]
    const workers = Array.from({ length: Math.min(PARTS_IN_PARALLEL, queue.length) }, async () => {
        for (;;) {
            const part = queue.shift()
            if (!part) return
            await uploadOne(part)
        }
    })
    await Promise.all(workers)

    cb.onUpdate({ phase: 'finishing', progress: 1 })

    const completeRes = await fetch(`/api/ent/uploads/${init.uploadSessionId}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal,
        body: JSON.stringify({ parts: init.parts.length > 1 ? etags : [] }),
    })
    if (!completeRes.ok) throw new Error(await readError(completeRes))

    // Từ đây Mux xử lý — người dùng theo dõi tiếp bằng badge trạng thái trong kho.
    cb.onUpdate({ phase: 'processing' })
}
