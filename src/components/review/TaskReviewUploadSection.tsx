'use client'

// [Review module P1.10] BÀN GIAO "Video review" sub-block inside the task drawer
// (UI-UX-SPEC §5). Two-option delivery: the existing link stays put; this adds
// "up thẳng video review". Flow: pick/drop video → confirm strip (auto-detected
// destination + "next version" hint) → enqueue on the module-singleton engine →
// card lifecycle Đang tải lên → Đang xử lý → Sẵn sàng | Lỗi (polled 3s).
//
// Scope note (P1.10): the confirm strip previews the AUTO destination + warns when
// the task title didn't parse. Manual "Đổi vị trí" (folder picker) + the ready
// card's review/share actions land with the Team browser (P2) / player (P4) /
// share (P5); they are intentionally absent here, not stubbed with dead buttons.

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { REVIEW_MODULE_LABEL } from '@/lib/review/labels'
import { toast } from 'sonner'
import {
    Film,
    UploadCloud,
    Loader2,
    AlertTriangle,
    Pause,
    Play,
    PlayCircle,
    MessageSquare,
    X,
    RotateCcw,
    Clapperboard,
    CheckCircle2,
} from 'lucide-react'
import { uploadEngine, validateFileMeta } from '@/lib/review/upload-engine'
import { useTaskUploads } from '@/lib/review/use-upload-store'
import { formatBytes, type UploadItem } from '@/lib/review/upload-store'
import { REVIEW_STATUS_MAP } from '@/lib/review/status-map'
import { apiConfirmTaskComplete } from '@/lib/review/team-actions'
import type { TaskAssetsResult, TaskDeliverableDto } from '@/lib/review/task-assets'
import type { ReviewStateDto } from '@/lib/review/dto'

const POLL_MS = 3000

export function TaskReviewUploadSection({
    taskId,
    taskStatus,
    onTaskCompleted,
}: {
    taskId: string
    /** Current task status — drives the "Chuyển task sang Hoàn tất?" banner (FR-D02). */
    taskStatus?: string | null
    /** Called after the task is flipped to Hoàn tất, so the drawer can sync its own state. */
    onTaskCompleted?: () => void
}) {
    const uploads = useTaskUploads(taskId)
    const [confirmingComplete, setConfirmingComplete] = useState(false)
    const [data, setData] = useState<TaskAssetsResult | null>(null)
    const [pendingFile, setPendingFile] = useState<File | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const refetch = useCallback(async () => {
        try {
            const res = await fetch(`/api/review/tasks/${encodeURIComponent(taskId)}/assets`, {
                credentials: 'same-origin',
                cache: 'no-store',
            })
            if (res.ok) setData((await res.json()) as TaskAssetsResult)
        } catch {
            /* transient — the next poll or drawer re-open retries */
        }
    }, [taskId])

    // initial load
    useEffect(() => {
        void refetch()
    }, [refetch])

    // live in-flight rows (this session), not the finished/canceled ones
    const liveItems = uploads.filter((it) => it.status !== 'done' && it.status !== 'canceled')
    const liveVersionIds = new Set(liveItems.map((it) => it.versionId).filter((x): x is string => !!x))

    const serverAssets = data?.assets ?? []
    // Don't double-render a version that a live row is already showing with live %.
    const serverCards = serverAssets.filter(
        (a) => !(a.currentVersion && liveVersionIds.has(a.currentVersion.id)),
    )

    // Poll while anything is in motion (client rows OR server pipeline).
    const shouldPoll =
        liveItems.some((it) =>
            ['queued', 'uploading', 'paused', 'completing', 'processing'].includes(it.status),
        ) ||
        serverAssets.some(
            (a) =>
                a.currentVersion &&
                ['uploading', 'uploaded', 'processing'].includes(a.currentVersion.uploadStatus),
        )
    useEffect(() => {
        if (!shouldPoll) return
        const t = setInterval(() => void refetch(), POLL_MS)
        return () => clearInterval(t)
    }, [shouldPoll, refetch])

    // When a live row finishes uploading (→processing/done), pull the server side promptly.
    const liveSig = liveItems.map((it) => `${it.id}:${it.status}`).join('|')
    useEffect(() => {
        void refetch()
    }, [liveSig, refetch])

    const onPick = (file: File | null) => {
        if (!file) return
        const mime = file.type || 'application/octet-stream'
        const meta = validateFileMeta(file.name, file.size, mime)
        if (!meta.ok) {
            toast.error(meta.message)
            return
        }
        if (meta.kind !== 'VIDEO') {
            toast.error(`Mục bàn giao chỉ nhận video. Ảnh sẽ hỗ trợ ở trình duyệt ${REVIEW_MODULE_LABEL}.`)
            return
        }
        setPendingFile(file)
        // refresh the destination preview in case assets/context changed since open
        void refetch()
    }

    const startUpload = () => {
        if (!pendingFile) return
        const crumbs = data?.uploadContext.breadcrumb ?? []
        const leaf = crumbs.length ? crumbs[crumbs.length - 1].name : undefined
        uploadEngine.enqueue(pendingFile, { kind: 'task', taskId }, leaf ? { targetLabel: leaf } : undefined)
        setPendingFile(null)
        // reflect the new placeholder card quickly
        setTimeout(() => void refetch(), 400)
    }

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onPick(file)
    }

    const hasCards = liveItems.length > 0 || serverCards.length > 0

    // P3.7 — a linked deliverable is at the "approved" status but the task isn't Hoàn tất yet:
    // offer to sync the task. The server (confirmTaskHoanTat) re-checks RBAC + the status FSM.
    const approvedAsset = serverAssets.find((a) => a.statusId === REVIEW_STATUS_MAP.approved) ?? null
    const showCompleteBanner = !!approvedAsset && taskStatus !== REVIEW_STATUS_MAP.approved

    const confirmComplete = useCallback(async () => {
        setConfirmingComplete(true)
        const tid = toast.loading('Đang chuyển task sang Hoàn tất…')
        try {
            await apiConfirmTaskComplete(taskId)
            toast.success('Đã chuyển task sang Hoàn tất.', { id: tid })
            onTaskCompleted?.()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không chuyển được trạng thái task.', { id: tid })
        } finally {
            setConfirmingComplete(false)
        }
    }, [taskId, onTaskCompleted])

    return (
        <div
            className={`mt-4 rounded-xl border p-3 transition-colors ${
                dragOver ? 'border-violet-500/60 bg-violet-500/5' : 'border-white/5 bg-white/[0.02]'
            }`}
            onDragOver={(e) => {
                e.preventDefault()
                if (!dragOver) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
        >
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Clapperboard size={13} className="text-violet-400" />
                Video review
                <span className="font-normal normal-case text-muted-foreground">— khách duyệt trực tiếp</span>
            </div>

            {/* P3.7 — sync task → Hoàn tất when a linked deliverable is at the approved status */}
            {showCompleteBanner && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-2.5">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-300" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-emerald-100">Bản dựng đã được duyệt</div>
                        <div className="truncate text-[11px] text-emerald-200/70">
                            “{approvedAsset?.name}” đang ở trạng thái “{REVIEW_STATUS_MAP.approved}”. Chuyển task sang Hoàn tất?
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={confirmComplete}
                        disabled={confirmingComplete}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
                    >
                        {confirmingComplete ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Chuyển sang Hoàn tất
                    </button>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                    onPick(e.target.files?.[0] ?? null)
                    e.target.value = '' // allow re-picking the same file
                }}
            />

            {/* live in-flight cards (this session) */}
            {liveItems.map((it) => (
                <UploadingCard key={it.id} item={it} />
            ))}

            {/* persisted deliverable cards */}
            {serverCards.map((a) => (
                <DeliverableCard key={a.assetId} asset={a} workspaceId={data?.workspaceId ?? ''} />
            ))}

            {/* confirm strip after a pick (renders even before context loads) */}
            {pendingFile ? (
                <ConfirmStrip
                    file={pendingFile}
                    ctx={data?.uploadContext ?? null}
                    onCancel={() => setPendingFile(null)}
                    onStart={startUpload}
                />
            ) : hasCards ? (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-violet-200"
                >
                    <UploadCloud size={13} /> Tải video review lên
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-violet-500/25 bg-white/[0.02] px-4 py-5 text-center transition-colors hover:border-violet-500/50 hover:bg-violet-500/[0.04]"
                >
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-[12.5px] font-medium text-white">
                        <UploadCloud size={14} /> Tải video review lên
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                        Khách xem và duyệt ngay trên web, không cần tài khoản.
                        <br />
                        Kéo thả video vào đây cũng được.
                    </span>
                </button>
            )}
        </div>
    )
}

/* ── confirm strip (§5.3) ─────────────────────────────────────────────────── */

function ConfirmStrip({
    file,
    ctx,
    onCancel,
    onStart,
}: {
    file: File
    ctx: TaskAssetsResult['uploadContext'] | null
    onCancel: () => void
    onStart: () => void
}) {
    const path = ctx ? ctx.breadcrumb.map((b) => b.name).join(' / ') : ''
    return (
        <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] p-3">
            <div className="flex items-center gap-2 text-[12px] text-zinc-200">
                <Film size={14} className="shrink-0 text-violet-300" />
                <span className="flex-1 truncate" title={file.name}>
                    {file.name}
                </span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatBytes(file.size)}</span>
            </div>

            {!ctx ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                    <Loader2 size={12} className="animate-spin" /> Đang xác định thư mục đích…
                </p>
            ) : ctx.existingAsset ? (
                <p className="mt-2 text-[11.5px] text-zinc-300">
                    Sẽ tạo <span className="font-semibold text-violet-200">v{ctx.existingAsset.nextVersionNumber}</span>{' '}
                    cho “{ctx.existingAsset.name}”.
                </p>
            ) : (
                <p className="mt-2 text-[11.5px] text-zinc-400">
                    Lưu vào: <span className="text-zinc-200">{path}</span>
                </p>
            )}

            {ctx && !ctx.parsedOk && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300/90">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    Không nhận diện được Khách/Brand từ tên task — sẽ lưu theo tên hiện tại.
                </p>
            )}

            <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-zinc-300 transition-colors hover:bg-white/[0.12]"
                >
                    Hủy
                </button>
                <button
                    type="button"
                    onClick={onStart}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-primary-accent"
                >
                    <UploadCloud size={13} /> Bắt đầu tải lên
                </button>
            </div>
        </div>
    )
}

/* ── in-flight card (from the client engine) ──────────────────────────────── */

function UploadingCard({ item }: { item: UploadItem }) {
    const pct =
        item.sizeBytes > 0 ? Math.min(100, Math.floor((item.bytesUploaded / item.sizeBytes) * 100)) : 0

    if (item.status === 'processing' || item.status === 'completing') {
        return (
            <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[12px] text-violet-200">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="truncate">{item.name}</span>
                </div>
                <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
                    Đang xử lý video… thường mất 1–3 phút. Bạn có thể đóng cửa sổ này — hệ thống sẽ báo khi video sẵn
                    sàng.
                </p>
            </div>
        )
    }

    if (item.status === 'failed') {
        return (
            <div className="mb-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                <div className="flex items-center gap-2 text-[12px] text-red-200">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="flex-1 truncate">{item.name}</span>
                </div>
                {item.error && <p className="mt-1 pl-6 text-[11px] text-red-300/90">{item.error}</p>}
                <div className="mt-2 flex items-center gap-2 pl-6">
                    <button
                        type="button"
                        onClick={() => uploadEngine.retry(item.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] text-zinc-100 hover:bg-white/[0.15]"
                    >
                        <RotateCcw size={12} /> Thử lại
                    </button>
                    <button
                        type="button"
                        onClick={() => uploadEngine.cancel(item.id)}
                        className="rounded-full px-2 py-1 text-[11px] text-zinc-400 hover:text-red-300"
                    >
                        Hủy
                    </button>
                </div>
            </div>
        )
    }

    // queued / uploading / paused
    const paused = item.status === 'paused'
    return (
        <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2">
                <Film size={14} className="shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-[12px] text-zinc-200">{item.name}</span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ${paused ? 'bg-amber-400/70' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10.5px] tabular-nums text-muted-foreground">
                    {formatBytes(Math.min(item.bytesUploaded, item.sizeBytes))} / {formatBytes(item.sizeBytes)}
                    {item.status === 'uploading' && item.speedBps ? ` • ${formatBytes(item.speedBps)}/s` : ''}
                    {paused ? (item.pausedReason === 'network' ? ' • chờ mạng…' : ' • đã tạm dừng') : ''}
                    {item.status === 'queued' ? ' • trong hàng đợi' : ''}
                </span>
                <div className="flex items-center gap-1">
                    {item.status === 'uploading' && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.pause(item.id)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            <Pause size={11} /> Tạm dừng
                        </button>
                    )}
                    {paused && item.pausedReason === 'user' && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.resume(item.id)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            <Play size={11} /> Tiếp tục
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => uploadEngine.cancel(item.id)}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/[0.08] hover:text-red-300"
                    >
                        <X size={11} /> Hủy
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ── persisted deliverable card (from the server) ─────────────────────────── */

const REVIEW_STATE: Record<ReviewStateDto, { label: string; cls: string }> = {
    draft: { label: 'Bản nháp', cls: 'bg-white/[0.06] text-zinc-400' },
    awaiting_review: { label: 'Chờ khách duyệt', cls: 'bg-primary/15 text-primary-accent' },
    changes_requested: { label: 'Khách yêu cầu sửa', cls: 'bg-amber-500/15 text-amber-300' },
    approved: { label: 'Đã duyệt', cls: 'bg-emerald-500/15 text-emerald-300' },
}

function DeliverableCard({ asset, workspaceId }: { asset: TaskDeliverableDto; workspaceId: string }) {
    const v = asset.currentVersion
    const status = v?.uploadStatus
    const openReview = () => {
        if (workspaceId) window.location.assign(`/${workspaceId}/team/asset/${asset.assetId}`)
    }

    // processing / uploaded (from another session) → transient
    if (!v || status === 'processing' || status === 'uploaded' || status === 'uploading') {
        return (
            <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-[12px] text-violet-200">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="truncate">{asset.name}</span>
                    {v && <span className="shrink-0 text-[10.5px] text-muted-foreground">v{v.versionNumber}</span>}
                </div>
                <p className="mt-1 pl-6 text-[11px] text-muted-foreground">Đang xử lý video…</p>
            </div>
        )
    }

    if (status === 'failed') {
        return (
            <div className="mb-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3">
                <div className="flex items-center gap-2 text-[12px] text-red-200">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span className="flex-1 truncate">{asset.name}</span>
                    <span className="shrink-0 text-[10.5px] text-red-300/70">v{v.versionNumber}</span>
                </div>
                <p className="mt-1 pl-6 text-[11px] text-red-300/90">
                    Bản này tải lên thất bại — hãy tải lại video review.
                </p>
            </div>
        )
    }

    // ready
    const rs = REVIEW_STATE[v.reviewState]
    const poster = v.media?.posterUrl
    const unresolved = asset.unresolvedCommentCount
    return (
        <div className="mb-2 flex gap-3 rounded-xl border border-[rgba(139,92,246,0.15)] bg-white/[0.04] p-2.5">
            <button
                type="button"
                onClick={openReview}
                disabled={!workspaceId}
                className="group relative aspect-video w-[112px] shrink-0 overflow-hidden rounded-lg bg-black/40 disabled:cursor-default"
                aria-label="Mở review"
            >
                {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={poster}
                        alt={asset.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground">
                        <Film size={20} />
                    </div>
                )}
                {workspaceId && (
                    <span className="absolute inset-0 grid place-items-center bg-black/0 text-white/0 transition group-hover:bg-black/40 group-hover:text-white">
                        <PlayCircle size={26} />
                    </span>
                )}
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start gap-2">
                    <span className="flex-1 truncate text-[12.5px] font-medium text-zinc-100" title={asset.name}>
                        {asset.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                        v{v.versionNumber}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-medium ${rs.cls}`}>
                        {rs.label}
                    </span>
                    {unresolved > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-300">
                            <MessageSquare size={11} /> {unresolved} chưa xử lý
                        </span>
                    )}
                </div>
                {/* [B1+FR-12] flex-wrap so the meta text + button never overflow the narrow
                    drawer column; the "Copy link khách" button was removed (FR-12 — editors
                    open review directly), which alone makes this row airy. */}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1.5">
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                        {v.uploadedBy?.name ? `${v.uploadedBy.name} • ` : ''}
                        {formatClock(v.createdAt)}
                        {v.commentCount > 0 ? ` • ${v.commentCount} bình luận` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={openReview}
                        disabled={!workspaceId}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-primary-accent disabled:opacity-50"
                    >
                        <PlayCircle size={13} /> Mở review
                    </button>
                </div>
            </div>
        </div>
    )
}

function formatClock(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    return `${hh}:${mm} ${dd}/${mo}`
}
