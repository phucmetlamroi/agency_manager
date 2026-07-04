// [Review module P1.9] Observable upload store — the single source of truth for
// what the Upload Tray / placeholder cards render (UPLOAD-PIPELINE §3.6). Lives
// OUTSIDE the React tree (module singleton) so navigating between pages never
// tears down an in-flight upload. No zustand: a hand-rolled snapshot store that
// plugs straight into React's `useSyncExternalStore` (getSnapshot returns a
// referentially-stable value until a mutation, so React only re-renders on real
// change). The engine (upload-engine.ts) is the only writer; components read.
//
// This file holds ONLY serializable display state. The heavy/non-serializable
// bits (the File handle, XHRs, collected ETags, retry timers) live in the
// engine's private runtime map — keeping snapshots cheap to diff.

import type { UploadStatusDto, VersionDto } from './dto'

// ── Public types ─────────────────────────────────────────────────────────────

/** Where an upload is destined (mirrors the initiate route contracts). */
export type UploadTarget =
    | { kind: 'folder'; folderId: string | null; workspaceId: string }
    | { kind: 'asset'; assetId: string }
    | { kind: 'task'; taskId: string }

export type UploadItemStatus =
    | 'queued' // accepted, waiting for a concurrency slot
    | 'uploading' // pushing parts to R2
    | 'paused' // user- or network-paused (see pausedReason)
    | 'interrupted' // tab reloaded → File handle lost; needs re-select (P1.10)
    | 'completing' // parts done, calling …/complete
    | 'processing' // server-side (Mux transcode / sharp) — poll every 3s
    | 'done' // pipeline reached READY
    | 'failed' // gave up (retryable via engine.retry)
    | 'canceled' // user canceled

export type PausedReason = 'user' | 'network'

export interface UploadBreadcrumb {
    id: string
    name: string
}

/** One row in the tray / one placeholder card. */
export interface UploadItem {
    id: string
    name: string // original filename (display)
    sizeBytes: number // File.size (integer, ≤5GB — safe in a JS number)
    kind: 'VIDEO' | 'IMAGE'
    status: UploadItemStatus
    pausedReason: PausedReason | null
    bytesUploaded: number
    /** Smoothed upload speed (bytes/sec) while uploading; null otherwise. */
    speedBps: number | null
    error: string | null
    errorCode: string | null
    /** Human label for the destination ("Bàn giao task", "Thư mục Team"). */
    targetLabel: string
    target: UploadTarget
    // ── filled after initiate ──
    uploadSessionId: string | null
    versionId: string | null
    assetId: string | null
    versionNumber: number | null
    // ── task-upload extras (auto folder tree) ──
    folderPath: UploadBreadcrumb[] | null
    createdNewAsset: boolean | null
    // ── filled when READY (lets the card render without a second fetch) ──
    version: VersionDto | null
    /** Server pipeline status from the last poll (diagnostic). */
    serverStatus: UploadStatusDto | null
    createdAt: number
    updatedAt: number
}

export interface UploadStoreState {
    /** Insertion order (newest last). */
    items: UploadItem[]
    byId: Record<string, UploadItem>
}

export interface UploadStore {
    subscribe(listener: () => void): () => void
    getSnapshot(): UploadStoreState
    getServerSnapshot(): UploadStoreState
    get(id: string): UploadItem | undefined
    /** Insert a new item (id must be unique). Returns the stored item. */
    add(item: UploadItem): UploadItem
    /** Shallow-merge a patch (or apply an updater) onto an existing item. No-op if absent. */
    patch(id: string, patch: Partial<UploadItem> | ((prev: UploadItem) => Partial<UploadItem>)): void
    remove(id: string): void
    /** Remove every item matching the predicate. */
    clear(predicate: (item: UploadItem) => boolean): void
    /** Wipe all items (tests / sign-out). */
    reset(): void
}

// ── Store implementation ─────────────────────────────────────────────────────

const EMPTY_STATE: UploadStoreState = Object.freeze({ items: [], byId: Object.freeze({}) }) as UploadStoreState

export function createUploadStore(): UploadStore {
    // Ordered map = source of truth; `snapshot` is the cached immutable view.
    const order: string[] = []
    const map = new Map<string, UploadItem>()
    const listeners = new Set<() => void>()
    let snapshot: UploadStoreState = EMPTY_STATE

    function rebuild() {
        const items = order.map((id) => map.get(id)!).filter(Boolean)
        const byId: Record<string, UploadItem> = {}
        for (const it of items) byId[it.id] = it
        snapshot = { items, byId }
    }

    function emit() {
        for (const l of listeners) l()
    }

    return {
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        getSnapshot() {
            return snapshot
        },
        getServerSnapshot() {
            return EMPTY_STATE
        },
        get(id) {
            return map.get(id)
        },
        add(item) {
            if (!map.has(item.id)) order.push(item.id)
            map.set(item.id, item)
            rebuild()
            emit()
            return item
        },
        patch(id, patch) {
            const prev = map.get(id)
            if (!prev) return
            const delta = typeof patch === 'function' ? patch(prev) : patch
            const next: UploadItem = { ...prev, ...delta, updatedAt: Date.now() }
            map.set(id, next)
            rebuild()
            emit()
        },
        remove(id) {
            if (!map.has(id)) return
            map.delete(id)
            const i = order.indexOf(id)
            if (i >= 0) order.splice(i, 1)
            rebuild()
            emit()
        },
        clear(predicate) {
            let changed = false
            for (const id of [...order]) {
                const it = map.get(id)
                if (it && predicate(it)) {
                    map.delete(id)
                    order.splice(order.indexOf(id), 1)
                    changed = true
                }
            }
            if (changed) {
                rebuild()
                emit()
            }
        },
        reset() {
            if (order.length === 0) return
            order.length = 0
            map.clear()
            snapshot = EMPTY_STATE
            emit()
        },
    }
}

/** Process-wide singleton — the queue every entry point shares. */
export const uploadStore: UploadStore = createUploadStore()

// ── Pure selectors / formatters (unit-testable, no I/O) ───────────────────────

/** A status that occupies the network / blocks tab close. */
export function isActiveStatus(status: UploadItemStatus): boolean {
    return status === 'uploading' || status === 'completing' || status === 'processing'
}

/** True while any item is mid-transfer — drives the `beforeunload` guard. */
export function hasBlockingUploads(items: UploadItem[]): boolean {
    return items.some((it) => it.status === 'uploading' || it.status === 'completing')
}

export interface AggregateProgress {
    totalBytes: number
    uploadedBytes: number
    /** 0–100, integer. 0 when there is nothing in flight. */
    percent: number
    active: number
    queued: number
    failed: number
    done: number
    total: number
}

/**
 * Batch progress for the tray header. Counts only items still in the pipeline
 * (queued/uploading/paused/completing/processing) toward the % bar — finished,
 * failed and canceled rows don't drag the number.
 */
export function aggregateProgress(items: UploadItem[]): AggregateProgress {
    let totalBytes = 0
    let uploadedBytes = 0
    let active = 0
    let queued = 0
    let failed = 0
    let done = 0
    const inPipeline = (s: UploadItemStatus) =>
        s === 'queued' || s === 'uploading' || s === 'paused' || s === 'completing' || s === 'processing'
    for (const it of items) {
        if (it.status === 'failed') failed++
        else if (it.status === 'done') done++
        else if (isActiveStatus(it.status)) active++
        else if (it.status === 'queued' || it.status === 'paused') queued++
        if (inPipeline(it.status)) {
            totalBytes += it.sizeBytes
            uploadedBytes += Math.min(it.bytesUploaded, it.sizeBytes)
        }
    }
    const percent = totalBytes > 0 ? Math.floor((uploadedBytes / totalBytes) * 100) : 0
    return { totalBytes, uploadedBytes, percent, active, queued, failed, done, total: items.length }
}

/** Seconds remaining for one item (null when unknowable). */
export function etaSeconds(item: UploadItem): number | null {
    if (item.status !== 'uploading' || !item.speedBps || item.speedBps <= 0) return null
    const remaining = Math.max(0, item.sizeBytes - item.bytesUploaded)
    return Math.ceil(remaining / item.speedBps)
}

/** "1.4 GB" / "820 KB". Binary units, matches the size-cap copy. */
export function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '0 B'
    if (n < 1024) return `${n} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let v = n / 1024
    let u = 0
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024
        u++
    }
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`
}

/** "3s" / "2m 05s" / "1h 04m" — compact ETA / elapsed. */
export function formatDuration(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds))
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rs = s % 60
    if (m < 60) return `${m}m ${String(rs).padStart(2, '0')}s`
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h ${String(rm).padStart(2, '0')}m`
}
