// [Review module P1.9] Client upload engine (UPLOAD-PIPELINE §3). Framework-
// agnostic, out-of-React: drives S3 multipart PUTs straight to R2 and only talks
// JSON to our routes. One process-wide singleton (`uploadEngine`) feeds the
// observable `uploadStore`; React components read the store, never the engine.
//
// What it implements from the spec:
//   • initiate → PUT parts → complete → poll(3s) → done            (§2)
//   • 4 parts/file, 3 files, 8 parts in-flight global cap          (§3.1)
//   • per-part retry: net/timeout/429/5xx w/ exp backoff, 5 tries  (§3.2)
//   • 403 → re-sign via re-initiate (same Idempotency-Key)         (§3.2)
//   • retry re-uploads ONLY missing parts (kept ETags)             (§3.2)
//   • pause/resume/cancel, 120s stall watchdog                     (§3.3)
//   • auto pause/resume on window offline/online                   (§3.3)
//   • beforeunload guard while transferring                        (§3.6)
//
// Byte payloads NEVER touch our server. Parts go over XHR (needs upload.onprogress);
// control-plane calls (initiate/complete/abort/poll) go over fetch with the session
// cookie (same-origin) — the routes authorize via getSession().

import { mediaKindFromMime, capForKind, type MediaKind } from './media-constants'
import { looksLikeMedia } from './upload-helpers'
import {
    uploadStore,
    type UploadStore,
    type UploadItem,
    type UploadTarget,
    type UploadBreadcrumb,
    type PausedReason,
} from './upload-store'
import type { UploadStatusDto, VersionDto } from './dto'

// ── Tunables (UPLOAD-PIPELINE §3.1 / §11.2) ──────────────────────────────────

export const MAX_CONCURRENT_FILES = 3
export const MAX_PARTS_PER_FILE = 4
export const MAX_PARTS_INFLIGHT = 8
export const MAX_PART_ATTEMPTS = 5
export const PART_STALL_TIMEOUT_MS = 120_000
export const POLL_INTERVAL_MS = 3_000
export const POLL_MAX_MS = 60 * 60_000 // stop polling after 1h (leave as 'processing')
export const BACKOFF_CAP_MS = 30_000
export const COMPLETE_MAX_ATTEMPTS = 4
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504])

const INITIATE_URL = '/api/review/uploads/initiate'
const TASK_INITIATE_URL = '/api/review/task-upload/initiate'
const uploadsUrl = (sessionId: string, sub = '') => `/api/review/uploads/${encodeURIComponent(sessionId)}${sub}`

// ── Pure helpers (exported for the probe — no I/O, no globals) ────────────────

export interface PartPlan {
    partNumber: number
    start: number
    end: number
    size: number
}

/** Slice a file into contiguous parts of `partSize` (last part smaller). Always ≥1 part. */
export function planParts(fileSize: number, partSize: number): PartPlan[] {
    if (fileSize <= 0 || partSize <= 0) return [{ partNumber: 1, start: 0, end: fileSize, size: fileSize }]
    const parts: PartPlan[] = []
    let start = 0
    let n = 1
    while (start < fileSize) {
        const end = Math.min(start + partSize, fileSize)
        parts.push({ partNumber: n, start, end, size: end - start })
        start = end
        n++
    }
    return parts
}

/** Exponential backoff with jitter: min(30s, 1000·2^attempt) + rand(0..500) (§3.2). */
export function computeBackoffMs(attempt: number, rand: () => number = Math.random): number {
    const base = Math.min(BACKOFF_CAP_MS, 1000 * Math.pow(2, Math.max(0, attempt)))
    return base + Math.floor(rand() * 500)
}

export function isRetryableStatus(status: number): boolean {
    return RETRYABLE_HTTP.has(status)
}

/**
 * Bytes uploaded so far = every completed part's full length + the live progress
 * of parts currently in flight, clamped to the file size.
 */
export function computeBytesUploaded(
    plan: PartPlan[],
    doneParts: Set<number>,
    inflight: Map<number, number>,
    fileSize: number,
): number {
    let total = 0
    for (const p of plan) if (doneParts.has(p.partNumber)) total += p.size
    for (const [, loaded] of inflight) total += loaded
    return Math.min(total, fileSize)
}

/** EMA of upload speed (bytes/sec). Ignores samples with a non-positive interval. */
export function nextSpeedEma(prev: number | null, deltaBytes: number, deltaMs: number): number | null {
    if (deltaMs <= 0 || deltaBytes < 0) return prev
    const inst = (deltaBytes / deltaMs) * 1000
    if (prev == null || !Number.isFinite(prev)) return inst
    return 0.7 * prev + 0.3 * inst
}

export type ValidationCode = 'EMPTY' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'BAD_CONTENT'
export type MetaValidation =
    | { ok: true; kind: MediaKind }
    | { ok: false; code: ValidationCode; message: string }

/** Client-side pre-flight (UPLOAD-PIPELINE §4.3 steps 1,2,4) — fail fast, save bandwidth. */
export function validateFileMeta(name: string, size: number, mime: string): MetaValidation {
    if (!size || size <= 0) return { ok: false, code: 'EMPTY', message: 'Tệp rỗng (0 byte).' }
    const kind = mediaKindFromMime(mime, name)
    if (!kind) {
        return {
            ok: false,
            code: 'UNSUPPORTED_TYPE',
            message: `Chỉ hỗ trợ file ảnh hoặc video. File "${name}" thuộc định dạng không được hỗ trợ.`,
        }
    }
    if (BigInt(Math.trunc(size)) > capForKind(kind)) {
        const label = kind === 'VIDEO' ? 'File vượt 5GB — hãy export lại ở bitrate thấp hơn.' : 'Ảnh vượt 100MB.'
        return { ok: false, code: 'TOO_LARGE', message: label }
    }
    return { ok: true, kind }
}

/** Magic-byte guard (§4.3 step 3): the leading bytes must look like the declared kind. */
export function validateFileContent(kind: MediaKind, head: Uint8Array): { ok: boolean; code?: ValidationCode; message?: string } {
    if (looksLikeMedia(kind, head)) return { ok: true }
    return { ok: false, code: 'BAD_CONTENT', message: 'Nội dung tệp không khớp định dạng khai báo.' }
}

// ── API client (control plane) ────────────────────────────────────────────────

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string | null,
        message: string,
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

interface InitiateBody {
    uploadSessionId: string
    assetId: string
    versionId: string
    versionNumber: number
    r2Key: string
    partSize: number
    parts: { partNumber: number; url: string }[]
    expiresAt: string
    createdNewAsset?: boolean
    folderPath?: UploadBreadcrumb[]
}
interface CompleteResponse {
    versionId: string
    uploadStatus: UploadStatusDto
}
interface PollResponse {
    uploadStatus: UploadStatusDto
    version: VersionDto | null
    error?: string
}

async function postJson<T>(url: string, body: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'same-origin' })
    return readJsonOrThrow<T>(res)
}

async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { method: 'GET', credentials: 'same-origin' })
    return readJsonOrThrow<T>(res)
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
    let json: unknown = null
    try {
        json = await res.json()
    } catch {
        /* empty / non-JSON body */
    }
    if (!res.ok) {
        const err = (json as { error?: { code?: string; message?: string } } | null)?.error
        throw new ApiError(res.status, err?.code ?? null, err?.message ?? `Lỗi máy chủ (${res.status}).`)
    }
    return json as T
}

function genId(): string {
    const c = (globalThis as { crypto?: Crypto }).crypto
    if (c?.randomUUID) return c.randomUUID()
    return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// ── Engine runtime (non-serializable per-item state) ─────────────────────────

type AbortKind = 'pause' | 'cancel' | 'timeout'

interface ItemRuntime {
    file: File
    target: UploadTarget
    mimeType: string
    /** Files in the same drop/pick as this one — see EnqueueOptions.batchSize. */
    batchSize?: number
    /** Uploader-chosen deliverable to version — see EnqueueOptions.targetAssetId. */
    targetAssetId?: string
    idempotencyKey: string
    contentValidated: boolean
    // set after initiate:
    initiated: boolean
    partSize: number
    singlePut: boolean
    partUrls: Map<number, string>
    plan: PartPlan[]
    // transfer bookkeeping:
    etags: Map<number, string>
    attempts: Map<number, number>
    retryAt: Map<number, number> // partNumber → earliest ms epoch it may re-launch
    inflight: Map<number, number> // partNumber → bytes loaded (live)
    active: Set<number>
    xhrs: Map<number, XMLHttpRequest>
    abortKind: Map<number, AbortKind>
    stallTimers: Map<number, ReturnType<typeof setTimeout>>
    retryTimers: Set<ReturnType<typeof setTimeout>>
    // lifecycle guards:
    paused: boolean
    canceled: boolean
    completing: boolean
    pollTimer: ReturnType<typeof setTimeout> | null
    pollStartedAt: number
    // progress smoothing:
    speedBps: number | null
    lastSampleBytes: number
    lastSampleTime: number
    lastFlushTime: number
}

export interface EnqueueOptions {
    targetLabel?: string
    /** [foldering 2026-07-27] Number of files in the SAME drop/pick this item belongs to. Sent to
     *  the task-upload initiate so the server can tell "next version of this video" (1) from
     *  "a set of hooks" (>1). Only meaningful for kind:'task'. */
    batchSize?: number
    /** [owner request 2026-07-27] Skip the name matcher entirely and stack onto THIS deliverable.
     *  Set when the uploader picked the target in the confirm strip; a near-miss filename would
     *  otherwise mint a new video on a multi-hook task. */
    targetAssetId?: string
}

export interface UploadEngine {
    enqueue(file: File, target: UploadTarget, opts?: EnqueueOptions): string
    pause(id: string): void
    pauseAll(): void
    resume(id: string): void
    resumeAll(): void
    cancel(id: string): void
    retry(id: string): void
    /** Drop finished/canceled rows (or all matching) from the tray. */
    clearFinished(): void
    remove(id: string): void
}

export function createUploadEngine(store: UploadStore): UploadEngine {
    const runtimes = new Map<string, ItemRuntime>()
    const activeFiles = new Set<string>() // files occupying an upload slot (uploading phase)
    let inflightGlobal = 0
    let listenersWired = false
    // Reentrancy guard: scheduleParts() is reachable synchronously from within a
    // pass (a part attempt that fails/throws on the same tick, a completion that
    // pumps). Never run the pass nested — request another pass instead.
    let scheduling = false
    let rescheduleRequested = false

    // ── global browser listeners (offline/online + beforeunload) ──
    function wireListeners() {
        if (listenersWired || typeof window === 'undefined') return
        listenersWired = true
        window.addEventListener('online', () => resumeAll('network'))
        window.addEventListener('offline', () => pauseAll('network'))
        window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
            const items = store.getSnapshot().items
            if (items.some((it) => it.status === 'uploading' || it.status === 'completing')) {
                e.preventDefault()
                e.returnValue = ''
                return ''
            }
        })
    }

    function defaultLabel(target: UploadTarget): string {
        switch (target.kind) {
            case 'task':
                return 'Bàn giao task'
            case 'asset':
                return 'Phiên bản mới'
            case 'folder':
                return 'Thư mục Team'
        }
    }

    // ── enqueue ──
    function enqueue(file: File, target: UploadTarget, opts: EnqueueOptions = {}): string {
        wireListeners()
        const id = genId()
        // Empty MIME (browsers report '' for .mkv etc.) → 'application/octet-stream': the initiate
        // routes require mimeType.min(1), and both mediaKindFromMime's octet-stream branch and the
        // server's own classifier fall back to the extension for it. Sending '' would 400 at initiate
        // — defeating the very VIDEO_EXT_FALLBACK the client + server were built to honor.
        const mimeType = file.type || 'application/octet-stream'
        const meta = validateFileMeta(file.name, file.size, mimeType)
        const now = Date.now()
        const base: UploadItem = {
            id,
            name: file.name,
            sizeBytes: file.size,
            kind: meta.ok ? meta.kind : 'VIDEO',
            status: meta.ok ? 'queued' : 'failed',
            pausedReason: null,
            bytesUploaded: 0,
            speedBps: null,
            error: meta.ok ? null : meta.message,
            errorCode: meta.ok ? null : meta.code,
            targetLabel: opts.targetLabel ?? defaultLabel(target),
            target,
            uploadSessionId: null,
            versionId: null,
            assetId: null,
            versionNumber: null,
            folderPath: null,
            createdNewAsset: null,
            version: null,
            serverStatus: null,
            createdAt: now,
            updatedAt: now,
        }
        store.add(base)
        if (!meta.ok) return id

        runtimes.set(id, freshRuntime(file, target, mimeType, opts.batchSize, opts.targetAssetId))
        // Content sniff (async) before we let it consume a slot.
        void sniffContent(id, file, meta.kind)
        return id
    }

    function freshRuntime(file: File, target: UploadTarget, mimeType: string, batchSize?: number, targetAssetId?: string): ItemRuntime {
        return {
            file,
            target,
            mimeType,
            batchSize,
            targetAssetId,
            idempotencyKey: genId(),
            contentValidated: false,
            initiated: false,
            partSize: 0,
            singlePut: false,
            partUrls: new Map(),
            plan: [],
            etags: new Map(),
            attempts: new Map(),
            retryAt: new Map(),
            inflight: new Map(),
            active: new Set(),
            xhrs: new Map(),
            abortKind: new Map(),
            stallTimers: new Map(),
            retryTimers: new Set(),
            paused: false,
            canceled: false,
            completing: false,
            pollTimer: null,
            pollStartedAt: 0,
            speedBps: null,
            lastSampleBytes: 0,
            lastSampleTime: 0,
            lastFlushTime: 0,
        }
    }

    async function sniffContent(id: string, file: File, kind: MediaKind) {
        try {
            const buf = await file.slice(0, 16).arrayBuffer()
            const rt = runtimes.get(id)
            if (!rt || rt.canceled) return
            const verdict = validateFileContent(kind, new Uint8Array(buf))
            if (!verdict.ok) {
                failFile(id, verdict.code ?? 'BAD_CONTENT', verdict.message ?? 'Nội dung tệp không hợp lệ.')
                return
            }
            rt.contentValidated = true
            pump()
        } catch {
            // Can't read the slice (permissions / gone) — let the server sniff catch it; allow through.
            const rt = runtimes.get(id)
            if (rt && !rt.canceled) {
                rt.contentValidated = true
                pump()
            }
        }
    }

    // ── scheduler ──
    function isStartable(item: UploadItem, rt: ItemRuntime | undefined): boolean {
        return !!rt && item.status === 'queued' && rt.contentValidated && !rt.paused && !rt.canceled
    }

    function pump() {
        // Fill file slots from the queue (oldest first).
        const items = store.getSnapshot().items
        for (const item of items) {
            if (activeFiles.size >= MAX_CONCURRENT_FILES) break
            if (activeFiles.has(item.id)) continue
            const rt = runtimes.get(item.id)
            if (isStartable(item, rt)) void startFile(item.id)
        }
        scheduleParts()
    }

    async function startFile(id: string) {
        const rt = runtimes.get(id)
        if (!rt || rt.canceled || rt.paused || activeFiles.has(id)) return
        activeFiles.add(id)
        store.patch(id, { status: 'uploading', error: null, errorCode: null, pausedReason: null })
        if (!rt.initiated) {
            try {
                await doInitiate(id)
            } catch (e) {
                handleInitiateError(id, e)
                return
            }
            // A pause/cancel may have landed during the await.
            const cur = store.get(id)
            if (!runtimes.get(id) || rt.canceled) return
            if (rt.paused || cur?.status === 'paused') {
                activeFiles.delete(id)
                return
            }
        }
        scheduleParts()
    }

    async function doInitiate(id: string) {
        const rt = runtimes.get(id)!
        const size = rt.file.size
        let resp: InitiateBody
        if (rt.target.kind === 'task') {
            resp = await postJson<InitiateBody>(
                TASK_INITIATE_URL,
                {
                    taskId: rt.target.taskId,
                    fileName: rt.file.name,
                    sizeBytes: String(size),
                    mimeType: rt.mimeType,
                    batchSize: rt.batchSize,
                    targetAssetId: rt.targetAssetId,
                },
                rt.idempotencyKey,
            )
        } else {
            resp = await postJson<InitiateBody>(
                INITIATE_URL,
                { fileName: rt.file.name, sizeBytes: String(size), mimeType: rt.mimeType, target: rt.target },
                rt.idempotencyKey,
            )
        }
        rt.partSize = resp.partSize
        rt.plan = planParts(size, resp.partSize)
        rt.singlePut = resp.parts.length <= 1
        rt.partUrls = new Map(resp.parts.map((p) => [p.partNumber, p.url]))
        rt.initiated = true
        store.patch(id, {
            uploadSessionId: resp.uploadSessionId,
            versionId: resp.versionId,
            assetId: resp.assetId,
            versionNumber: resp.versionNumber,
            folderPath: resp.folderPath ?? null,
            createdNewAsset: resp.createdNewAsset ?? null,
        })
    }

    function handleInitiateError(id: string, e: unknown) {
        activeFiles.delete(id)
        if (e instanceof ApiError) {
            if (e.code === 'UNSUPPORTED_MEDIA_TYPE' || e.code === 'FILE_TOO_LARGE' || e.code === 'VALIDATION_ERROR') {
                failFile(id, e.code, e.message)
                return
            }
        }
        // Network / 5xx / unknown → retryable via the Retry button.
        failFile(id, e instanceof ApiError ? (e.code ?? 'INITIATE_FAILED') : 'NETWORK', 'Không thể bắt đầu tải lên. Thử lại.')
        pump()
    }

    /** Launch eligible parts across all active files respecting per-file + global caps. */
    function scheduleParts() {
        if (scheduling) {
            rescheduleRequested = true
            return
        }
        scheduling = true
        try {
            do {
                rescheduleRequested = false
                runSchedulePass()
            } while (rescheduleRequested)
        } finally {
            scheduling = false
        }
    }

    function runSchedulePass() {
        const nowMs = Date.now()
        for (const id of activeFiles) {
            if (inflightGlobal >= MAX_PARTS_INFLIGHT) return
            const rt = runtimes.get(id)
            if (!rt || !rt.initiated || rt.paused || rt.canceled || rt.completing) continue
            for (const part of rt.plan) {
                if (inflightGlobal >= MAX_PARTS_INFLIGHT) return
                if (rt.active.size >= MAX_PARTS_PER_FILE) break
                if (rt.etags.has(part.partNumber)) continue
                if (rt.active.has(part.partNumber)) continue
                const notBefore = rt.retryAt.get(part.partNumber) ?? 0
                if (notBefore > nowMs) continue
                runPartAttempt(id, part)
            }
            maybeComplete(id)
        }
    }

    // ── one part attempt (holds a global slot only during the PUT) ──
    function runPartAttempt(id: string, part: PartPlan) {
        const rt = runtimes.get(id)
        if (!rt) return
        rt.active.add(part.partNumber)
        inflightGlobal++
        rt.inflight.set(part.partNumber, 0)

        const url = rt.partUrls.get(part.partNumber)
        if (!url) {
            // Release the slot we just took before failing (no xhr/done() will run for this part).
            rt.active.delete(part.partNumber)
            rt.inflight.delete(part.partNumber)
            inflightGlobal = Math.max(0, inflightGlobal - 1)
            settlePart(id, part, { type: 'fatal', message: 'Thiếu URL tải lên cho part.' })
            return
        }
        const xhr = new XMLHttpRequest()
        rt.xhrs.set(part.partNumber, xhr)
        let settled = false
        const done = (res: PartResult) => {
            if (settled) return
            settled = true
            clearStall(rt, part.partNumber)
            rt.xhrs.delete(part.partNumber)
            const kind = rt.abortKind.get(part.partNumber)
            rt.abortKind.delete(part.partNumber)
            rt.active.delete(part.partNumber)
            inflightGlobal = Math.max(0, inflightGlobal - 1)
            if (kind === 'pause' || kind === 'cancel') {
                rt.inflight.delete(part.partNumber)
                flushProgress(id)
                // The freed slot may unblock other files / a resumed-or-retried file whose
                // relaunch was skipped while this stale part was still counted active.
                scheduleParts()
                return
            }
            settlePart(id, part, res)
        }

        xhr.upload.onprogress = (ev: ProgressEvent) => {
            rt.inflight.set(part.partNumber, ev.loaded)
            armStall(id, part.partNumber)
            flushProgress(id)
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag')
                if (etag) done({ type: 'ok', etag })
                else if (rt.singlePut) done({ type: 'ok', etag: '' }) // server confirms single-part via headObject
                else done({ type: 'fatal', message: 'Không đọc được ETag của part (kiểm tra CORS R2).' })
            } else if (xhr.status === 403) {
                done({ type: 'expired' })
            } else if (isRetryableStatus(xhr.status)) {
                done({ type: 'retry', status: xhr.status })
            } else {
                done({ type: 'fatal', status: xhr.status, message: `Kho lưu trữ từ chối part (HTTP ${xhr.status}).` })
            }
        }
        xhr.onerror = () => done({ type: 'retry' })
        xhr.onabort = () => done({ type: 'retry' }) // abortKind (if pause/cancel) is checked inside done()

        try {
            xhr.open('PUT', url, true)
            if (rt.singlePut && rt.mimeType) xhr.setRequestHeader('Content-Type', rt.mimeType)
            xhr.send(rt.file.slice(part.start, part.end))
            armStall(id, part.partNumber)
        } catch {
            done({ type: 'retry' })
        }
    }

    type PartResult =
        | { type: 'ok'; etag: string }
        | { type: 'retry'; status?: number }
        | { type: 'expired' }
        | { type: 'fatal'; status?: number; message: string }

    function settlePart(id: string, part: PartPlan, res: PartResult) {
        const rt = runtimes.get(id)
        if (!rt || rt.canceled) return
        const pn = part.partNumber

        if (res.type === 'ok') {
            rt.etags.set(pn, res.etag)
            rt.inflight.delete(pn)
            rt.attempts.delete(pn)
            rt.retryAt.delete(pn)
            flushProgress(id, true)
            scheduleParts()
            maybeComplete(id)
            return
        }

        rt.inflight.delete(pn)
        flushProgress(id)

        if (res.type === 'expired') {
            // 403 = presigned URL expired/invalid → re-sign via re-initiate (counts as one attempt).
            const attempt = (rt.attempts.get(pn) ?? 0) + 1
            rt.attempts.set(pn, attempt)
            if (attempt >= MAX_PART_ATTEMPTS) {
                failFile(id, 'UPLOAD_EXPIRED', 'Liên kết tải lên đã hết hạn. Thử lại.')
                return
            }
            void refreshPartUrls(id)
                .then(() => {
                    const cur = runtimes.get(id)
                    if (cur && !cur.canceled && !cur.paused) scheduleParts()
                })
                .catch(() => {
                    // The re-initiate fetch isn't aborted on cancel — don't fail a row the user
                    // already canceled/removed (would resurrect a terminal, un-retryable state).
                    const cur = runtimes.get(id)
                    if (cur && !cur.canceled && !cur.paused) {
                        failFile(id, 'UPLOAD_EXPIRED', 'Không làm mới được liên kết tải lên. Thử lại.')
                    }
                })
            return
        }

        if (res.type === 'fatal') {
            failFile(id, res.status ? `HTTP_${res.status}` : 'PART_FATAL', res.message)
            return
        }

        // retry (network / timeout / retryable 5xx)
        const attempt = (rt.attempts.get(pn) ?? 0) + 1
        rt.attempts.set(pn, attempt)
        if (attempt >= MAX_PART_ATTEMPTS) {
            failFile(id, 'NETWORK', 'Tải lên thất bại sau nhiều lần thử. Thử lại.')
            return
        }
        const delay = computeBackoffMs(attempt)
        rt.retryAt.set(pn, Date.now() + delay)
        const t = setTimeout(() => {
            rt.retryTimers.delete(t)
            const cur = runtimes.get(id)
            if (cur && !cur.canceled && !cur.paused) scheduleParts()
        }, delay)
        rt.retryTimers.add(t)
        scheduleParts() // let other files use the freed slot immediately
    }

    async function refreshPartUrls(id: string) {
        const rt = runtimes.get(id)
        if (!rt) return
        const size = rt.file.size
        let resp: InitiateBody
        if (rt.target.kind === 'task') {
            resp = await postJson<InitiateBody>(
                TASK_INITIATE_URL,
                {
                    taskId: rt.target.taskId,
                    fileName: rt.file.name,
                    sizeBytes: String(size),
                    mimeType: rt.mimeType,
                    batchSize: rt.batchSize,
                    targetAssetId: rt.targetAssetId,
                },
                rt.idempotencyKey,
            )
        } else {
            resp = await postJson<InitiateBody>(
                INITIATE_URL,
                { fileName: rt.file.name, sizeBytes: String(size), mimeType: rt.mimeType, target: rt.target },
                rt.idempotencyKey,
            )
        }
        // A cancel/pause may have landed during the re-initiate round-trip (the fetch is NOT
        // aborted) — re-read state before any write so we don't drive a torn-down/paused row.
        const cur = runtimes.get(id)
        if (!cur || cur.canceled || cur.paused) return
        if (resp.parts.length > 0) cur.partUrls = new Map(resp.parts.map((p) => [p.partNumber, p.url]))
        // Empty parts ⇒ the session is already finalized/aborted server-side. If we've
        // collected every ETag, drive complete; otherwise it can't be finished here.
        else if (cur.etags.size >= cur.plan.length) maybeComplete(id)
        else failFile(id, 'UPLOAD_EXPIRED', 'Phiên tải lên không còn hợp lệ. Thử lại.')
    }

    // ── stall watchdog (120s no-progress → abort as timeout → retry) ──
    function armStall(id: string, pn: number) {
        const rt = runtimes.get(id)
        if (!rt) return
        clearStall(rt, pn)
        const t = setTimeout(() => {
            const cur = runtimes.get(id)
            const xhr = cur?.xhrs.get(pn)
            if (cur && xhr) {
                cur.abortKind.set(pn, 'timeout')
                try {
                    xhr.abort()
                } catch {
                    /* noop */
                }
            }
        }, PART_STALL_TIMEOUT_MS)
        rt.stallTimers.set(pn, t)
    }
    function clearStall(rt: ItemRuntime, pn: number) {
        const t = rt.stallTimers.get(pn)
        if (t) {
            clearTimeout(t)
            rt.stallTimers.delete(pn)
        }
    }

    // ── progress → store (throttled) ──
    function flushProgress(id: string, force = false) {
        const rt = runtimes.get(id)
        if (!rt) return
        const now = Date.now()
        if (!force && now - rt.lastFlushTime < 200) return
        rt.lastFlushTime = now
        const doneSet = new Set(rt.etags.keys())
        const bytes = computeBytesUploaded(rt.plan, doneSet, rt.inflight, rt.file.size)
        if (rt.lastSampleTime > 0) {
            const spd = nextSpeedEma(rt.speedBps, bytes - rt.lastSampleBytes, now - rt.lastSampleTime)
            if (spd != null) rt.speedBps = spd
        }
        rt.lastSampleBytes = bytes
        rt.lastSampleTime = now
        store.patch(id, { bytesUploaded: bytes, speedBps: rt.speedBps })
    }

    // ── complete → poll ──
    function maybeComplete(id: string) {
        const rt = runtimes.get(id)
        if (!rt || rt.canceled || rt.paused || rt.completing || !rt.initiated) return
        if (rt.active.size > 0) return
        if (rt.etags.size < rt.plan.length) return
        void doComplete(id)
    }

    async function doComplete(id: string) {
        const rt = runtimes.get(id)
        if (!rt || rt.completing) return
        rt.completing = true
        // Parts are done → free the upload slot for the next queued file.
        activeFiles.delete(id)
        rt.speedBps = null
        store.patch(id, { status: 'completing', bytesUploaded: rt.file.size, speedBps: null })
        pump()

        const sessionId = store.get(id)?.uploadSessionId
        if (!sessionId) {
            failFile(id, 'STATE_INVALID', 'Thiếu phiên tải lên.')
            return
        }
        const parts = [...rt.etags.entries()]
            .filter(([, etag]) => etag) // single-part may have no etag → server uses headObject
            .map(([partNumber, etag]) => ({ partNumber, etag }))
            .sort((a, b) => a.partNumber - b.partNumber)

        let attempt = 0
        for (;;) {
            if (rt.canceled || !runtimes.get(id)) return
            try {
                const resp = await postJson<CompleteResponse>(uploadsUrl(sessionId, '/complete'), { parts })
                onCompleted(id, resp.uploadStatus)
                return
            } catch (e) {
                if (rt.canceled || !runtimes.get(id)) return
                const transient = e instanceof ApiError ? e.status >= 500 || e.status === 429 : true
                attempt++
                if (transient && attempt < COMPLETE_MAX_ATTEMPTS) {
                    await sleep(computeBackoffMs(attempt))
                    continue
                }
                const code = e instanceof ApiError ? (e.code ?? 'COMPLETE_FAILED') : 'NETWORK'
                const msg =
                    e instanceof ApiError && e.status === 410
                        ? 'Phiên tải lên đã hết hạn. Thử lại.'
                        : 'Không thể hoàn tất tải lên. Thử lại.'
                // completing → failed: release completing guard so Retry works.
                rt.completing = false
                failFile(id, code, msg)
                return
            }
        }
    }

    function onCompleted(id: string, status: UploadStatusDto) {
        const rt = runtimes.get(id)
        if (!rt || rt.canceled) return
        store.patch(id, { serverStatus: status })
        rt.pollStartedAt = Date.now() // covers the ready-branch single poll too (bounds its retries)
        if (status === 'failed') {
            failFile(id, 'PROCESSING', 'Xử lý phía máy chủ thất bại.')
            return
        }
        if (status === 'ready') {
            void pollOnce(id) // fetch the version DTO once, then mark done
            return
        }
        // processing / uploaded → spinner + 3s poll
        store.patch(id, { status: 'processing' })
        schedulePoll(id)
    }

    function schedulePoll(id: string) {
        const rt = runtimes.get(id)
        if (!rt) return
        if (rt.pollTimer) clearTimeout(rt.pollTimer)
        rt.pollTimer = setTimeout(() => void pollOnce(id), POLL_INTERVAL_MS)
    }

    async function pollOnce(id: string) {
        const rt = runtimes.get(id)
        if (!rt || rt.canceled) return
        const sessionId = store.get(id)?.uploadSessionId
        if (!sessionId) return
        try {
            const resp = await getJson<PollResponse>(uploadsUrl(sessionId))
            const cur = runtimes.get(id)
            if (!cur || cur.canceled) return
            store.patch(id, { serverStatus: resp.uploadStatus })
            if (resp.uploadStatus === 'ready') {
                finishReady(id, resp.version)
                return
            }
            if (resp.uploadStatus === 'failed') {
                failFile(id, 'PROCESSING', resp.error || 'Xử lý phía máy chủ thất bại.')
                return
            }
            if (Date.now() - cur.pollStartedAt > POLL_MAX_MS) {
                abandonPoll(id) // give up watching; free the File handle
                return
            }
            schedulePoll(id)
        } catch {
            // transient network error while polling — keep trying (server-side janitor is the backstop).
            const cur = runtimes.get(id)
            if (!cur || cur.canceled) return
            if (Date.now() - cur.pollStartedAt > POLL_MAX_MS) {
                abandonPoll(id)
                return
            }
            schedulePoll(id)
        }
    }

    /**
     * Stop watching a version that is still PROCESSING after the 1h poll window (a very long
     * Mux transcode, or a dropped webhook). The upload itself succeeded, so the File is no longer
     * needed — free the runtime (and its File handle) and leave the row truthfully at 'processing'.
     * A page reload / the drawer's own version poll (P1.10) resolves it to ready later.
     */
    function abandonPoll(id: string) {
        const rt = runtimes.get(id)
        if (rt) teardownRuntime(rt) // clears the (already-fired) pollTimer + any stray timers
        runtimes.delete(id) // drops the last reference to rt.file → GC-eligible
        activeFiles.delete(id)
    }

    function finishReady(id: string, version: VersionDto | null) {
        const rt = runtimes.get(id)
        store.patch(id, {
            status: 'done',
            bytesUploaded: store.get(id)?.sizeBytes ?? 0,
            speedBps: null,
            error: null,
            errorCode: null,
            version: version ?? null,
        })
        if (rt) teardownRuntime(rt) // free the File handle — a done upload never retries
        runtimes.delete(id)
        activeFiles.delete(id)
        pump()
    }

    // ── pause / resume / cancel / retry ──
    function pause(id: string) {
        pauseItem(id, 'user')
    }
    function pauseAll(reason: PausedReason = 'user') {
        for (const item of store.getSnapshot().items) {
            if (item.status === 'queued' || item.status === 'uploading') pauseItem(item.id, reason)
        }
    }
    function pauseItem(id: string, reason: PausedReason) {
        const rt = runtimes.get(id)
        const item = store.get(id)
        if (!rt || !item || rt.canceled) return
        if (item.status !== 'queued' && item.status !== 'uploading') return
        rt.paused = true
        abortActiveParts(rt, 'pause')
        clearRetryTimers(rt)
        activeFiles.delete(id)
        store.patch(id, { status: 'paused', pausedReason: reason, speedBps: null })
        rt.speedBps = null
        pump()
    }

    function resume(id: string) {
        resumeItem(id)
    }
    function resumeAll(onlyReason?: PausedReason) {
        for (const item of store.getSnapshot().items) {
            if (item.status !== 'paused') continue
            if (onlyReason && item.pausedReason !== onlyReason) continue
            resumeItem(item.id)
        }
    }
    function resumeItem(id: string) {
        const rt = runtimes.get(id)
        const item = store.get(id)
        if (!rt || !item || item.status !== 'paused' || rt.canceled) return
        rt.paused = false
        // Clear lingering backoff AND the spent per-part attempt budget: a resume (especially the
        // auto-resume on 'online' after an outage) is a fresh start, not a continuation of the
        // failure streak that led to the pause.
        rt.retryAt.clear()
        rt.attempts.clear()
        store.patch(id, { status: 'queued', pausedReason: null })
        pump()
    }

    function cancel(id: string) {
        const rt = runtimes.get(id)
        const item = store.get(id)
        if (!item) return
        // A finished (or already-canceled) upload has nothing to cancel — never relabel a
        // server-finalized 'done' row as 'canceled' (a bulk "Hủy tất cả" would otherwise
        // do exactly that). Mirrors failFile's terminal-status guard. 'failed' stays
        // cancelable so the card's "Hủy" button can dismiss a failed row.
        if (item.status === 'done' || item.status === 'canceled') return
        if (rt) {
            rt.canceled = true
            abortActiveParts(rt, 'cancel')
            teardownRuntime(rt)
            const sessionId = item.uploadSessionId
            if (sessionId) {
                void fetch(uploadsUrl(sessionId, '/abort'), { method: 'POST', credentials: 'same-origin' }).catch(
                    () => {},
                )
            }
        }
        runtimes.delete(id)
        activeFiles.delete(id)
        store.patch(id, { status: 'canceled', speedBps: null, pausedReason: null })
        pump()
    }

    function retry(id: string) {
        const rt = runtimes.get(id)
        const item = store.get(id)
        if (!rt || !item || item.status !== 'failed') return
        const expired = item.errorCode === 'UPLOAD_EXPIRED' || item.errorCode === 'STATE_INVALID'
        if (expired) {
            // Session gone → fresh upload (new idempotency key, new version via max+1 / new asset).
            rt.idempotencyKey = genId()
            rt.initiated = false
            rt.partUrls.clear()
            rt.plan = []
            rt.etags.clear()
            store.patch(id, { uploadSessionId: null, versionId: null, assetId: null, versionNumber: null })
        }
        rt.attempts.clear()
        rt.retryAt.clear()
        rt.completing = false
        rt.speedBps = null
        rt.lastSampleTime = 0
        rt.lastSampleBytes = 0
        // Keep the resume-from-missing-parts progress: already-collected ETags still count.
        // (expired path cleared plan+etags above → this evaluates to 0.)
        const kept = computeBytesUploaded(rt.plan, new Set(rt.etags.keys()), new Map(), item.sizeBytes)
        store.patch(id, { status: 'queued', error: null, errorCode: null, pausedReason: null, bytesUploaded: kept })
        pump()
    }

    function clearFinished() {
        for (const item of store.getSnapshot().items) {
            if (item.status === 'done' || item.status === 'canceled') store.remove(item.id)
        }
    }
    function remove(id: string) {
        const rt = runtimes.get(id)
        if (rt && (rt.active.size > 0 || rt.completing) && !rt.canceled) {
            cancel(id)
        }
        if (rt) teardownRuntime(rt)
        runtimes.delete(id)
        activeFiles.delete(id)
        store.remove(id)
        pump() // removing an in-flight-but-all-backoff file frees a slot → let a queued file start
    }

    // ── shared teardown / failure ──
    function abortActiveParts(rt: ItemRuntime, kind: AbortKind) {
        for (const [pn, xhr] of rt.xhrs) {
            rt.abortKind.set(pn, kind)
            try {
                xhr.abort()
            } catch {
                /* noop */
            }
        }
    }
    function clearRetryTimers(rt: ItemRuntime) {
        for (const t of rt.retryTimers) clearTimeout(t)
        rt.retryTimers.clear()
        for (const [, t] of rt.stallTimers) clearTimeout(t)
        rt.stallTimers.clear()
    }
    function teardownRuntime(rt: ItemRuntime) {
        clearRetryTimers(rt)
        if (rt.pollTimer) {
            clearTimeout(rt.pollTimer)
            rt.pollTimer = null
        }
    }

    function failFile(id: string, code: string, message: string) {
        const item = store.get(id)
        // Never resurrect/overwrite a terminal or user-paused row: a stale async (a re-initiate
        // rejection landing after the user canceled, a poll after done) must NOT flip
        // 'canceled'/'done'/'paused' → 'failed' (which would also strand it — retry needs a runtime).
        if (!item || item.status === 'canceled' || item.status === 'done' || item.status === 'paused') return
        // Exclude from any schedule pass FIRST: aborting sibling parts below fires their
        // onabort synchronously → their drain calls scheduleParts(); if this file were still
        // in activeFiles it would relaunch parts for the very upload we're failing.
        activeFiles.delete(id)
        const rt = runtimes.get(id)
        if (rt) {
            if (!rt.canceled) abortActiveParts(rt, 'cancel') // stop any in-flight parts (they won't count)
            clearRetryTimers(rt)
            if (rt.pollTimer) {
                clearTimeout(rt.pollTimer)
                rt.pollTimer = null
            }
            rt.completing = false
            rt.speedBps = null
        }
        store.patch(id, { status: 'failed', error: message, errorCode: code, speedBps: null, pausedReason: null })
        pump()
    }

    return { enqueue, pause, pauseAll, resume, resumeAll, cancel, retry, clearFinished, remove }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
}

/** Process-wide singleton bound to the shared store. */
export const uploadEngine: UploadEngine = createUploadEngine(uploadStore)
