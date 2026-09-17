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
    CheckCheck,
} from 'lucide-react'
import { uploadEngine, validateFileMeta } from '@/lib/review/upload-engine'
import { REVIEW_UPLOAD_MAINTENANCE, REVIEW_UPLOAD_MAINTENANCE_MESSAGE } from '@/lib/review/upload-maintenance'
import { useTaskUploads } from '@/lib/review/use-upload-store'
import { formatBytes, type UploadItem } from '@/lib/review/upload-store'
import { REVIEW_STATUS_MAP } from '@/lib/review/status-map'
import { apiConfirmTaskComplete, apiConfirmFix } from '@/lib/review/team-actions'
import { failureMessage } from '@/lib/ui/action-feedback'
import type { TaskAssetsResult, TaskDeliverableDto } from '@/lib/review/task-assets'
import type { ReviewStateDto } from '@/lib/review/dto'

const POLL_MS = 3000

export function TaskReviewUploadSection({
    taskId,
    taskStatus,
    onTaskCompleted,
    onTaskStatusChanged,
}: {
    taskId: string
    /** Current task status — drives the "Chuyển task sang Hoàn tất?" banner (FR-D02). */
    taskStatus?: string | null
    /** Called after the task is flipped to Hoàn tất, so the drawer can sync its own state. */
    onTaskCompleted?: () => void
    /** Called after ANY status flip this block triggers (F9 confirm-fix) with the status the
     *  server actually wrote, so the drawer's chip stops lying. Separate from onTaskCompleted,
     *  which hardcodes 'Hoàn tất' at both call sites. */
    onTaskStatusChanged?: (newStatus: string) => void
}) {
    const uploads = useTaskUploads(taskId)
    const [confirmingComplete, setConfirmingComplete] = useState(false)
    const [data, setData] = useState<TaskAssetsResult | null>(null)
    const [pendingFiles, setPendingFiles] = useState<File[]>([])
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    // [status-audit 2026-07-23] F9 from the drawer — see fixConfirm in task-assets.ts.
    const [confirmingFix, setConfirmingFix] = useState(false)
    /** The id of the ONE upload the editor ticked "đây là bản sửa feedback" for; consumed once
     *  THAT upload lands, so the manager is never told "đã sửa xong" for bytes that never
     *  arrived. Storing the id, not a boolean, is load-bearing: `uploads` keeps finished rows
     *  in the module-singleton store, so a plain "any upload is settled" test both fires for
     *  the WRONG file and — when a previous upload was already 'done' — never re-fires at all. */
    const pendingFixUploadIdRef = useRef<string | null>(null)

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

    // [foldering 2026-07-27] Accepts a LIST now. The drop handler used to read
    // `e.dataTransfer.files?.[0]` and the picker had no `multiple`, so dragging a set of hooks
    // silently uploaded the first file and discarded the rest — the multi-hook flow the owner
    // demonstrated could not work at all. Rejected files are reported individually so a single bad
    // file in a batch never swallows the good ones.
    const onPick = (files: File[]) => {
        if (!files.length) return
        // [Tệp maintenance 2026-08-04] Chặn cả kéo-thả lẫn picker; nút tải lên bên dưới
        // đã ẩn nhưng onDrop vẫn dẫn về đây nên đây là chốt của khối này.
        if (REVIEW_UPLOAD_MAINTENANCE) {
            toast.error(REVIEW_UPLOAD_MAINTENANCE_MESSAGE)
            return
        }
        const accepted: File[] = []
        for (const file of files) {
            const mime = file.type || 'application/octet-stream'
            const meta = validateFileMeta(file.name, file.size, mime)
            if (!meta.ok) {
                toast.error(`${file.name}: ${meta.message}`)
                continue
            }
            if (meta.kind !== 'VIDEO') {
                toast.error(`${file.name}: mục bàn giao chỉ nhận video. Ảnh sẽ hỗ trợ ở trình duyệt ${REVIEW_MODULE_LABEL}.`)
                continue
            }
            accepted.push(file)
        }
        if (!accepted.length) return
        setPendingFiles(accepted)
        // refresh the destination preview in case assets/context changed since open
        void refetch()
    }

    const startUpload = (markAsFix: boolean, targetAssetId?: string) => {
        if (!pendingFiles.length) return
        const crumbs = data?.uploadContext.breadcrumb ?? []
        const leaf = crumbs.length ? crumbs[crumbs.length - 1].name : undefined
        // batchSize is the whole decision: 1 = next version of this task's video (flat, task-named);
        // >1 = a set of siblings (grouped into the task folder, each named from its own file).
        const batchSize = pendingFiles.length
        const ids = pendingFiles.map((file) =>
            // targetAssetId only applies to a single file — a batch is N distinct hooks, so forcing
            // them all onto one stack would collapse the set into versions of one video again.
            uploadEngine.enqueue(file, { kind: 'task', taskId }, {
                targetLabel: leaf,
                batchSize,
                targetAssetId: batchSize === 1 ? targetAssetId : undefined,
            }),
        )
        // [status-audit / owner decision D1 2026-07-23] Arm the confirm, don't fire it. The flip
        // happens when THIS upload's bytes actually land (effect below) — an upload that fails or
        // is cancelled must not leave the manager reading "đã sửa xong" with no new cut to look at.
        // For a batch we arm on the LAST file: the round is only really re-delivered once the whole
        // set has landed, so confirming on the first would tell the manager "done" mid-transfer.
        pendingFixUploadIdRef.current = markAsFix ? ids[ids.length - 1] ?? null : null
        setPendingFiles([])
        // reflect the new placeholder card quickly
        setTimeout(() => void refetch(), 400)
    }

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        setDragOver(false)
        onPick(Array.from(e.dataTransfer.files ?? []))
    }

    const hasCards = liveItems.length > 0 || serverCards.length > 0

    // P3.7 — a linked deliverable is at the "approved" status but the task isn't Hoàn tất yet:
    // offer to sync the task. The server (confirmTaskHoanTat) re-checks RBAC + the status FSM.
    const approvedAsset = serverAssets.find((a) => a.statusId === REVIEW_STATUS_MAP.approved) ?? null
    const showCompleteBanner = !!approvedAsset && taskStatus !== REVIEW_STATUS_MAP.approved

    // [status-audit 2026-07-23] The A3/A6 exit, in the drawer. Same endpoint the player header
    // uses; the server re-checks the predecessor + assignee-or-admin, so this is not a new
    // authz surface — only a second door onto the one that already existed.
    const fixConfirm = data?.fixConfirm ?? null
    const confirmFix = useCallback(
        async (assetId: string) => {
            setConfirmingFix(true)
            const tid = toast.loading('Đang xác nhận đã sửa xong…')
            try {
                const res = await apiConfirmFix(assetId)
                toast.success(`Đã chuyển task sang “${res.status}”.`, { id: tid })
                // Retire the banner from the LOCAL snapshot first. `refetch` swallows non-OK
                // responses and errors, so relying on it alone means a flaky GET right after a
                // successful POST leaves the banner up, inviting a second click that 409s.
                setData((prev) => (prev ? { ...prev, fixConfirm: null } : prev))
                await refetch()
                onTaskStatusChanged?.(res.status)
            } catch (e) {
                // failureMessage đứng NGOÀI e.message có chủ đích: khi mất mạng, e.message
                // là "Failed to fetch" — tiếng Anh, của trình duyệt, người dùng không hiểu.
                toast.error(failureMessage(e, e instanceof Error ? e.message : 'Không xác nhận được. Thử lại.'), { id: tid })
            } finally {
                setConfirmingFix(false)
            }
        },
        [refetch, onTaskStatusChanged],
    )

    // [status-audit / owner decision D1] The "đây là bản đã sửa feedback" tick does NOT write the
    // status by itself. It arms a HIGHLIGHT on the confirm banner, and the editor clicks once.
    //
    // Two earlier drafts tried to fire it automatically and both were wrong, for the same reason:
    // any client-side write races the Mux-ready webhook. applyMuxReady commits its PROCESSING→READY
    // transaction and only AFTERWARDS calls syncTaskFromReviewEvent(..., A2) (inngest.ts). So the
    // upload poll can observe READY — and therefore fire — in the window before that sync runs. The
    // sync then finds A4, which IS a legal predecessor of A2 (task-statuses.ts, deliberately, so a
    // re-upload at A4 loops back into review), and drags the task backwards. The editor's confirm
    // disappears and the manager gets two contradictory notifications: precisely the class of bug
    // this whole change set exists to remove. Firing at 'processing' instead of 'done' only widened
    // that window; it never closed it, and 'processing' additionally fires while Mux can still
    // ERROR the version, reporting "đã sửa xong" for a cut nobody can watch.
    //
    // A human click is not a workaround for the race — it eliminates it. By the time anyone reads
    // the banner and clicks, the webhook has long since run and no-op'd (at A3, which is NOT a
    // predecessor of A2), so the confirm is unambiguously the last writer. The editor still never
    // has to REMEMBER anything, which is the whole point of D1: the system tells them.
    const armedUpload = uploads.find((it) => it.id === pendingFixUploadIdRef.current)
    const armedUploadStatus = armedUpload?.status
    /** true once the upload the editor marked has landed and its confirm is still pending. */
    const fixArmed = armedUploadStatus === 'done'
    useEffect(() => {
        // Disarm on a terminal failure so a later, unrelated upload never inherits the highlight.
        if (armedUploadStatus === 'canceled' || armedUploadStatus === 'failed') {
            pendingFixUploadIdRef.current = null
        }
    }, [armedUploadStatus])

    // Any upload still moving for this task. While one is in flight the confirm banner is hidden:
    // clicking it mid-transcode writes A4 (or A7) that the imminent Mux-ready handler can undo —
    // and on the CLIENT round revokeClientExposureOnNewVersion additionally revokes the share and
    // resets to A2, so the "Revised" email the confirm sends would carry a link about to die.
    const uploadInFlight = uploads.some((it) =>
        ['queued', 'uploading', 'paused', 'completing', 'processing'].includes(it.status),
    )

    const confirmComplete = useCallback(async () => {
        setConfirmingComplete(true)
        const tid = toast.loading('Đang chuyển task sang Hoàn tất…')
        try {
            await apiConfirmTaskComplete(taskId)
            toast.success('Đã chuyển task sang Hoàn tất.', { id: tid })
            onTaskCompleted?.()
        } catch (e) {
            toast.error(failureMessage(e, e instanceof Error ? e.message : 'Không chuyển được trạng thái task.'), { id: tid })
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

            {/* [status-audit 2026-07-23] The A3/A6 exit, right where the editor works. Before this
                banner existed, "Xác nhận đã sửa xong" lived ONLY in the review-player header — so an
                editor who fixed the cut and uploaded it from this very block had no way to say so,
                and the task sat at "Đang sửa feedback (nội bộ)" until an admin retyped the status. */}
            {fixConfirm && !uploadInFlight && (
                <div
                    className={`mb-2 flex items-center gap-2.5 rounded-xl border p-2.5 ${
                        fixArmed
                            ? 'border-teal-400/60 bg-teal-500/[0.16] ring-1 ring-teal-400/30'
                            : 'border-teal-500/30 bg-teal-500/[0.08]'
                    }`}
                >
                    <CheckCheck size={16} className="shrink-0 text-teal-300" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium text-teal-100">
                            {fixArmed
                                ? 'Bản vừa tải lên được đánh dấu là bản đã sửa'
                                : fixConfirm.onBehalf
                                  ? 'Editor đã sửa xong đợt này?'
                                  : 'Bạn đã sửa xong đợt feedback này?'}
                        </div>
                        <div className="truncate text-[11px] text-teal-200/70">
                            {fixArmed
                                ? `Bấm xác nhận để chuyển task sang “${fixConfirm.targetStatus}” và báo quản lý duyệt.`
                                : `Xác nhận để chuyển task sang “${fixConfirm.targetStatus}” và báo quản lý duyệt.`}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            pendingFixUploadIdRef.current = null
                            void confirmFix(fixConfirm.assetId)
                        }}
                        disabled={confirmingFix}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-teal-400 disabled:opacity-60"
                    >
                        {confirmingFix ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                        {fixConfirm.onBehalf ? 'Xác nhận editor đã sửa' : 'Xác nhận đã sửa xong'}
                    </button>
                </div>
            )}

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
                multiple
                className="hidden"
                onChange={(e) => {
                    onPick(Array.from(e.target.files ?? []))
                    e.target.value = '' // allow re-picking the same file
                }}
            />

            {/* live in-flight cards (this session) */}
            {liveItems.map((it) => (
                <UploadingCard key={it.id} item={it} />
            ))}

            {/* [owner request 2026-07-28] persisted deliverables. ONE video keeps its thumbnail —
                that is the whole point of the card. A SET collapses to a single tile that opens the
                task's folder in Tệp: a task of 10 hooks rendered 10 stacked cards and blew the
                drawer apart, and the thumbnails all look alike anyway, so the grid in Tệp is the
                better place to tell them apart. Falls back to the card list when the videos are not
                all in one folder — no single folder means no honest destination to link to. */}
            {data?.deliverableFolder && serverCards.length >= 2 ? (
                <DeliverableFolderTile
                    folder={data.deliverableFolder}
                    workspaceId={data.workspaceId}
                    unresolved={serverCards.reduce((n, a) => n + a.unresolvedCommentCount, 0)}
                />
            ) : (
                serverCards.map((a) => (
                    <DeliverableCard key={a.assetId} asset={a} workspaceId={data?.workspaceId ?? ''} />
                ))
            )}

            {/* confirm strip after a pick (renders even before context loads) */}
            {pendingFiles.length > 0 ? (
                <ConfirmStrip
                    // Remount when the picked file changes, so the "đây là bản đã sửa feedback"
                    // tick can never carry over from a file the editor replaced (drag a new one
                    // in while the strip is open) onto a file they never opted in for.
                    key={pendingFiles.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join('|')}
                    files={pendingFiles}
                    ctx={data?.uploadContext ?? null}
                    // [owner decision D1] Offer the question only on the INTERNAL round, and only
                    // when this viewer may actually confirm.
                    //
                    // Never on the client round (A6→A7): a new version landing while the client
                    // holds a live link makes revokeClientExposureOnNewVersion revoke the share and
                    // force the task back to A2 — by design (R5: an un-re-approved cut must not
                    // reach the client). Coupling an auto-confirm to that upload would mail the
                    // client "Revised" with a link the revoke is about to kill, and stamp an A7 the
                    // reset then erases. The manual banner still covers A6 for an editor who
                    // deliberately confirms a client fix.
                    fixTargetStatus={
                        fixConfirm?.targetStatus === REVIEW_STATUS_MAP.internalFixDone
                            ? fixConfirm.targetStatus
                            : null
                    }
                    onCancel={() => setPendingFiles([])}
                    onStart={startUpload}
                />
            ) : REVIEW_UPLOAD_MAINTENANCE ? (
                // [Tệp closure 2026-08-04 — yêu cầu chủ sản phẩm] Task detail KHÔNG hiển thị
                // phần up video nữa (không nút, không note) — bàn giao dùng ô "Link" của khối
                // Bàn giao. Card video đã bàn giao trước đó (bên trên) vẫn hiện để tải về.
                null
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
    files,
    ctx,
    fixTargetStatus,
    onCancel,
    onStart,
}: {
    files: File[]
    ctx: TaskAssetsResult['uploadContext'] | null
    /** Non-null when the task is mid-revision and this viewer may confirm the round. */
    fixTargetStatus: string | null
    onCancel: () => void
    onStart: (markAsFix: boolean, targetAssetId?: string) => void
}) {
    // [foldering 2026-07-27] The breadcrumb from the server still ends at the per-task video level.
    // Only a BATCH actually creates that folder now, so a single file's real destination is the
    // parent — drop the leaf rather than promising a folder the upload will not make.
    const crumbs = ctx?.breadcrumb.map((b) => b.name) ?? []
    const isBatch = files.length > 1
    const path = isBatch ? crumbs.join(' / ') : crumbs.slice(0, -1).join(' / ')
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    // [owner decision D1 2026-07-23] Default OFF: editors also upload work-in-progress cuts
    // mid-round, and auto-advancing those would tell the manager "đã sửa xong" about a draft.
    const [markAsFix, setMarkAsFix] = useState(false)
    // [owner request 2026-07-27] On a multi-hook task, name matching is a guess: a filename that is
    // one character off silently mints a NEW video instead of adding v2, and the editor only finds
    // out afterwards. Let them pick the target. Empty string = keep the automatic behaviour.
    const [pickedAssetId, setPickedAssetId] = useState('')
    const canPickTarget = !isBatch && (ctx?.taskAssets.length ?? 0) > 1
    return (
        <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.06] p-3">
            {files.slice(0, 4).map((f) => (
                <div key={`${f.name}:${f.lastModified}`} className="flex items-center gap-2 text-[12px] text-zinc-200">
                    <Film size={14} className="shrink-0 text-violet-300" />
                    <span className="flex-1 truncate" title={f.name}>
                        {f.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatBytes(f.size)}</span>
                </div>
            ))}
            {files.length > 4 && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">…và {files.length - 4} video nữa</p>
            )}

            {!ctx ? (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                    <Loader2 size={12} className="animate-spin" /> Đang xác định thư mục đích…
                </p>
            ) : isBatch ? (
                // Say the grouping out loud BEFORE the upload starts. This is the one place the
                // automatic decision is visible in advance, so it must not be a surprise.
                <p className="mt-2 text-[11.5px] text-zinc-300">
                    {files.length} video → gộp vào thư mục{' '}
                    <span className="font-semibold text-violet-200">“{crumbs[crumbs.length - 1] ?? ''}”</span>{' '}
                    <span className="text-muted-foreground">({formatBytes(totalBytes)})</span>
                    <br />
                    <span className="text-[11px] text-zinc-400">
                        Lưu vào: {path} · mỗi video là một mục riêng, đặt tên theo tên file.
                    </span>
                </p>
            ) : ctx.existingAsset ? (
                <p className="mt-2 text-[11.5px] text-zinc-300">
                    Sẽ tạo <span className="font-semibold text-violet-200">v{ctx.existingAsset.nextVersionNumber}</span>{' '}
                    cho “{ctx.existingAsset.name}”.
                    {/* An automatic rename must be announced BEFORE it happens, like the grouping
                        decision above — the owner has to be able to cancel if it is not what they want. */}
                    {ctx.existingAsset.willRenameTo && (
                        <>
                            <br />
                            <span className="text-[11px] text-zinc-400">
                                Video sẽ được đổi tên thành{' '}
                                <span className="text-violet-200">“{ctx.existingAsset.willRenameTo}”</span> cho khớp tên
                                task. Đổi tên tay sau đó sẽ được giữ nguyên.
                            </span>
                        </>
                    )}
                </p>
            ) : (
                <p className="mt-2 text-[11.5px] text-zinc-400">
                    Lưu vào: <span className="text-zinc-200">{path}</span>{' '}
                    <span className="text-muted-foreground">(không tạo thư mục riêng)</span>
                    {/* The single case that made the owner think naming-from-the-task did not exist:
                        the strip listed the FILE names and never said what the video would be called. */}
                    <br />
                    <span className="text-[11px] text-zinc-500">
                        Video sẽ có tên <span className="text-zinc-300">“{crumbs[crumbs.length - 1] ?? ''}”</span> (lấy
                        theo tên task, không theo tên file)
                    </span>
                </p>
            )}

            {/* The old copy read "Không nhận diện được Khách/Brand từ tên task — sẽ lưu theo tên
                hiện tại": it names an internal parsing convention the user was never told about and
                ends on "tên hiện tại" (whose name?). The owner said on camera: "là sao ta, không
                hiểu lắm". Say what happened, where the file lands, and that nothing is broken. */}
            {canPickTarget && (
                <div className="mt-2.5 rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[11px] font-medium text-zinc-300">Task này có nhiều video — file mới thuộc video nào?</p>
                    <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-[11.5px] text-zinc-300">
                        <input
                            type="radio"
                            name="upload-target"
                            className="mt-[3px] accent-violet-500"
                            checked={pickedAssetId === ''}
                            onChange={() => setPickedAssetId('')}
                        />
                        <span>
                            Tự động khớp theo tên
                            <span className="block text-[10.5px] text-muted-foreground">
                                Khớp tên file với tên video. Lệch một ký tự là tạo video mới.
                            </span>
                        </span>
                    </label>
                    <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-[11.5px] text-zinc-300">
                        <input
                            type="radio"
                            name="upload-target"
                            className="mt-[3px] accent-violet-500"
                            checked={pickedAssetId !== ''}
                            onChange={() => setPickedAssetId(ctx?.taskAssets[0]?.id ?? '')}
                        />
                        <span>Chọn video cụ thể để đè phiên bản mới</span>
                    </label>
                    {pickedAssetId !== '' && (
                        <select
                            value={pickedAssetId}
                            onChange={(e) => setPickedAssetId(e.target.value)}
                            className="mt-1.5 w-full rounded-lg border border-white/10 bg-zinc-900/70 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none focus:border-violet-400/60"
                        >
                            {ctx?.taskAssets.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name} → v{a.nextVersionNumber}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            )}

            {ctx && !ctx.parsedOk && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300/90">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>
                        Tên task không theo mẫu <span className="text-amber-200">“Khách / Brand · Tên video”</span>, nên
                        thư mục video sẽ lấy nguyên tên task. File vẫn được lưu bình thường vào đường dẫn ở trên.
                    </span>
                </p>
            )}

            {fixTargetStatus && (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-lg border border-teal-500/25 bg-teal-500/[0.06] px-2.5 py-2">
                    <input
                        type="checkbox"
                        checked={markAsFix}
                        onChange={(e) => setMarkAsFix(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-teal-400"
                    />
                    <span className="text-[11.5px] leading-relaxed text-teal-100/90">
                        Đây là bản đã sửa feedback
                        <span className="block text-[11px] text-teal-200/60">
                            Tải lên xong sẽ tự chuyển task sang “{fixTargetStatus}” và báo quản lý duyệt.
                        </span>
                    </span>
                </label>
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
                    onClick={() => onStart(markAsFix, pickedAssetId || undefined)}
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

/* ── collapsed tile for a task whose deliverables are a SET (2+ in one folder) ─── */

function DeliverableFolderTile({
    folder,
    workspaceId,
    unresolved,
}: {
    folder: { id: string; name: string; videoCount: number }
    workspaceId: string
    unresolved: number
}) {
    const open = () => {
        if (workspaceId) window.location.assign(`/${workspaceId}/team/folder/${folder.id}`)
    }
    return (
        <button
            type="button"
            onClick={open}
            className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-violet-400/40 hover:bg-white/[0.06]"
            title={`Mở thư mục “${folder.name}” trong ${REVIEW_MODULE_LABEL}`}
        >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-300">
                <Clapperboard size={22} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-zinc-100">{folder.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{folder.videoCount} video</span>
                    {unresolved > 0 && (
                        <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-amber-300/90">{unresolved} góp ý chưa xử lý</span>
                        </>
                    )}
                </div>
            </div>
            <span className="shrink-0 text-[11.5px] font-medium text-violet-300">Mở thư mục →</span>
        </button>
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
