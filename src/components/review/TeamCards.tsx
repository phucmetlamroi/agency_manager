'use client'

// [Review module P2.3] Team-browser GRID cards (FR-B05) + single-select InfoPanel.
// Faithful to UI-UX-SPEC §1.4.4/§1.4.5: folder card (icon + name + 'N mục • size'),
// asset card (poster + hover-scrub, version badge only when ≥2 versions, duration
// overlay, name, uploader•date w/ full-datetime tooltip, status chip + 💬N of the
// CURRENT version). Status chip is a PLACEHOLDER (real dropdown = P3). Selection
// checkbox + '…' menu affordances are P2.5, so they are not drawn here yet. Folder
// 2×2 thumbnail preview needs a backend preview feed → deferred (icon shown instead).

import {
    useEffect,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type DragEvent as ReactDragEvent,
} from 'react'
import { Folder as FolderIcon, Film, Image as ImageIcon, MessageSquare, Loader2, AlertTriangle, X, Check, Layers, UploadCloud } from 'lucide-react'
import { statusLabel } from '@/lib/display-labels'
import { formatBytes } from '@/lib/review/upload-store'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import type { ItemRef } from '@/lib/review/team-actions'
import type { Aspect, ThumbScale } from '@/lib/review/view-prefs'
import { aspectCss, msToClock, formatDate, formatDateTime, statusColor } from '@/lib/review/view-prefs'
import { HoverScrub } from './HoverScrub'
// [review-fixes BR-04] StatusControl không còn render trên card/InfoPanel (deprecate lib ở follow-up).

/* ── P3.6 drag-and-drop wiring (shared by grid + list) ───────────────────────
   Internal item drags carry an ItemRef[] on this MIME. Dropping an asset onto an
   asset = merge (version); dropping any item onto a folder = move. Dropping OS
   files onto an asset card = a new version for that asset. */
export const REVIEW_ITEMS_MIME = 'application/x-review-items'

export interface ItemDnd {
    /** Ids currently being dragged (a card suppresses its own drop-target visuals). */
    draggingIds: Set<string>
    onDragStart: (e: ReactDragEvent, id: string) => void
    onDragEnd: () => void
    /** Drop dragged items onto a folder → move. */
    onDropItemsOnFolder: (items: ItemRef[], folderId: string) => void
    /** Drop dragged items onto an asset → merge (only a single asset is valid). */
    onDropItemsOnAsset: (items: ItemRef[], targetAssetId: string) => void
    /** Drop OS files onto an asset → new version (parent reads the DataTransfer). */
    onDropFilesOnAsset: (assetId: string, dt: DataTransfer) => void
    /** Hover of OS files over an asset (so the folder-level drop overlay can hide). */
    onFileHoverAsset: (assetId: string | null) => void
    /** Assets with an in-flight upload — block merge/version + show a tooltip. */
    busyAssetIds: Set<string>
}

function dtHasFiles(e: ReactDragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files')
}
function dtHasItems(e: ReactDragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes(REVIEW_ITEMS_MIME)
}
function readItems(e: ReactDragEvent): ItemRef[] {
    try {
        const raw = e.dataTransfer.getData(REVIEW_ITEMS_MIME)
        const parsed = raw ? (JSON.parse(raw) as ItemRef[]) : []
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export function bytesLabel(raw: string | number): string {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n <= 0) return '0 B'
    return formatBytes(n)
}

/** ready | processing | failed — derived from the head version's upload status. */
export function assetState(a: AssetDto): 'ready' | 'processing' | 'failed' {
    const s = a.currentVersion?.uploadStatus
    if (s === 'failed') return 'failed'
    if (s === 'ready') return 'ready'
    return 'processing' // uploading | uploaded | processing | no version yet
}

export function StatusChip({ status }: { status: string | null }) {
    if (!status) return null
    const c = statusColor(status)
    return (
        <span
            className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{ color: c, background: `${c}1A`, border: `1px solid ${c}44` }}
            title={status}
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
            <span className="truncate">{statusLabel(status)}</span>
        </span>
    )
}

function Poster({ asset, thumb }: { asset: AssetDto; thumb: ThumbScale }) {
    const [failed, setFailed] = useState(false)
    const poster = asset.currentVersion?.media?.posterUrl
    if (poster && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={poster}
                alt={asset.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className="absolute inset-0 h-full w-full"
                style={{ objectFit: thumb === 'fit' ? 'contain' : 'cover' }}
            />
        )
    }
    return (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            {asset.mediaKind === 'image' ? <ImageIcon size={24} /> : <Film size={24} />}
        </div>
    )
}

function ProcessingOverlay({ state }: { state: 'processing' | 'failed' }) {
    if (state === 'failed') {
        return (
            <div className="absolute inset-0 grid place-items-center gap-1 bg-black/50 text-center">
                <AlertTriangle size={20} className="text-red-300" />
                <span className="text-[11px] text-red-200">Xử lý thất bại</span>
            </div>
        )
    }
    return (
        <div className="absolute inset-0 grid place-items-center gap-1 bg-black/40 text-center">
            <Loader2 size={20} className="animate-spin text-violet-300" />
            <span className="text-[11px] text-zinc-300">Đang xử lý…</span>
        </div>
    )
}

/* ── selection + inline-rename affordances (P2.5) ────────────────────────── */

export function SelectCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-label={checked ? 'Bỏ chọn' : 'Chọn'}
            onClick={(e) => {
                e.stopPropagation()
                onToggle()
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`absolute left-2 top-2 z-10 flex h-[18px] w-[18px] items-center justify-center rounded border transition-all ${
                checked
                    ? 'border-violet-400 bg-violet-500 text-white opacity-100'
                    : 'border-white/40 bg-black/50 text-transparent opacity-0 group-hover:opacity-100'
            }`}
        >
            <Check size={12} strokeWidth={3} />
        </button>
    )
}

/** Inline text editor for rename (auto-focus + select-all; Enter commits, Esc cancels). */
export function InlineRename({
    initial,
    onCommit,
    onCancel,
}: {
    initial: string
    onCommit: (name: string) => void
    onCancel: () => void
}) {
    const ref = useRef<HTMLInputElement>(null)
    const done = useRef(false)
    useEffect(() => {
        const el = ref.current
        if (el) {
            el.focus()
            el.select()
        }
    }, [])
    const commit = () => {
        if (done.current) return
        done.current = true
        const val = ref.current?.value.trim() ?? ''
        if (val && val !== initial) onCommit(val)
        else onCancel()
    }
    return (
        <input
            ref={ref}
            defaultValue={initial}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    done.current = true
                    onCancel()
                }
            }}
            onBlur={commit}
            className="w-full rounded border border-violet-400/60 bg-black/50 px-1.5 py-0.5 text-[12.5px] text-white outline-none focus:border-violet-400"
        />
    )
}

/* ── FOLDER card ─────────────────────────────────────────────────────────── */

export function FolderCardGrid({
    folder,
    selected,
    renaming,
    onSelect,
    onToggle,
    onOpen,
    onCommitRename,
    onCancelRename,
    dnd,
}: {
    folder: FolderDto
    selected: boolean
    renaming?: boolean
    onSelect: (e: ReactMouseEvent) => void
    onToggle: () => void
    onOpen: () => void
    onCommitRename?: (name: string) => void
    onCancelRename?: () => void
    dnd?: ItemDnd
}) {
    const [moveOver, setMoveOver] = useState(false)
    const isSource = !!dnd && dnd.draggingIds.has(folder.id)

    const onDragOver = (e: ReactDragEvent) => {
        if (!dnd || isSource || !dtHasItems(e)) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (!moveOver) setMoveOver(true)
    }
    const onDrop = (e: ReactDragEvent) => {
        if (!dnd || isSource || !dtHasItems(e)) return
        e.preventDefault()
        e.stopPropagation()
        setMoveOver(false)
        const items = readItems(e).filter((i) => !(i.type === 'folder' && i.id === folder.id))
        if (items.length) dnd.onDropItemsOnFolder(items, folder.id)
    }

    return (
        <div
            role="button"
            tabIndex={0}
            data-review-id={folder.id}
            data-review-type="folder"
            draggable={!!dnd && !renaming}
            onDragStart={(e) => dnd?.onDragStart(e, folder.id)}
            onDragEnd={() => dnd?.onDragEnd()}
            onDragOver={onDragOver}
            onDragLeave={() => setMoveOver(false)}
            onDrop={onDrop}
            onClick={onSelect}
            onDoubleClick={() => !renaming && onOpen()}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !renaming) onOpen()
            }}
            className={`group relative flex cursor-pointer flex-col rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                moveOver
                    ? 'border-violet-400 bg-violet-500/[0.14] ring-2 ring-violet-400/60'
                    : selected
                      ? 'border-violet-500 bg-violet-500/[0.08]'
                      : 'border-white/5 bg-white/[0.03] hover:border-violet-500/30 hover:bg-white/[0.06]'
            }`}
        >
            {moveOver && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-violet-950/40">
                    <span className="rounded-full bg-violet-500 px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-lg">
                        Di chuyển vào đây
                    </span>
                </div>
            )}
            <SelectCheckbox checked={selected} onToggle={onToggle} />
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <FolderIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    {renaming && onCommitRename && onCancelRename ? (
                        <InlineRename initial={folder.name} onCommit={onCommitRename} onCancel={onCancelRename} />
                    ) : (
                        <div className="truncate text-[13px] font-medium text-zinc-100" title={folder.name}>
                            {folder.name}
                        </div>
                    )}
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {folder.itemCount} mục · {bytesLabel(folder.totalBytes)}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ── ASSET card ──────────────────────────────────────────────────────────── */

export function AssetCardGrid({
    asset,
    aspect,
    thumb,
    showInfo,
    selected,
    renaming,
    onSelect,
    onToggle,
    onOpen,
    onCommitRename,
    onCancelRename,
    onSetStatus,
    dnd,
}: {
    asset: AssetDto
    aspect: Aspect
    thumb: ThumbScale
    showInfo: boolean
    selected: boolean
    renaming?: boolean
    onSelect: (e: ReactMouseEvent) => void
    onToggle: () => void
    onOpen: () => void
    onCommitRename?: (name: string) => void
    onCancelRename?: () => void
    onSetStatus?: (statusId: string | null) => void
    dnd?: ItemDnd
}) {
    const v = asset.currentVersion
    const state = assetState(asset)
    const dur = msToClock(v?.durationMs)
    const showVersionBadge = asset.versionCount >= 2 && v
    const storyboard = v?.media?.storyboardVttUrl
    const isReadyVideo = state === 'ready' && asset.mediaKind === 'video' && !!storyboard
    const commentCount = v?.commentCount ?? 0
    const canRename = renaming && onCommitRename && onCancelRename

    // P3.6 drop-target state: 'file' = new-version upload, 'merge' = asset-onto-asset.
    const [over, setOver] = useState<'none' | 'file' | 'merge'>('none')
    const isSource = !!dnd && dnd.draggingIds.has(asset.id)
    const busy = !!dnd && dnd.busyAssetIds.has(asset.id)

    const onDragOver = (e: ReactDragEvent) => {
        if (!dnd) return
        if (dtHasFiles(e)) {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
            if (over !== 'file') {
                setOver('file')
                dnd.onFileHoverAsset(asset.id)
            }
        } else if (dtHasItems(e) && !isSource) {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = busy ? 'none' : 'copy'
            if (over !== 'merge') setOver('merge')
        }
    }
    const clearOver = () => {
        if (over === 'file') dnd?.onFileHoverAsset(null)
        setOver('none')
    }
    const onDrop = (e: ReactDragEvent) => {
        if (!dnd) return
        if (dtHasFiles(e)) {
            e.preventDefault()
            e.stopPropagation()
            clearOver()
            if (!busy) dnd.onDropFilesOnAsset(asset.id, e.dataTransfer)
        } else if (dtHasItems(e) && !isSource) {
            e.preventDefault()
            e.stopPropagation()
            setOver('none')
            if (!busy) dnd.onDropItemsOnAsset(readItems(e), asset.id)
        }
    }

    return (
        <div
            data-review-id={asset.id}
            data-review-type="asset"
            draggable={!!dnd && !renaming}
            onDragStart={(e) => dnd?.onDragStart(e, asset.id)}
            onDragEnd={() => dnd?.onDragEnd()}
            onDragOver={onDragOver}
            onDragLeave={clearOver}
            onDrop={onDrop}
            onClick={onSelect}
            onDoubleClick={() => !renaming && onOpen()}
            className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-all ${
                over === 'merge'
                    ? 'border-violet-400 ring-2 ring-violet-400/60'
                    : selected
                      ? 'border-violet-500 bg-violet-500/[0.08]'
                      : 'border-white/5 bg-white/[0.03] hover:border-white/15'
            }`}
        >
            {over === 'file' && (
                <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-violet-400/70 bg-violet-950/70 px-2 text-center">
                    <UploadCloud size={20} className={busy ? 'text-zinc-400' : 'text-violet-200'} />
                    <span className={`text-[11px] font-medium ${busy ? 'text-zinc-400' : 'text-violet-100'}`}>
                        {busy ? 'Chờ upload hiện tại hoàn tất' : `Thả để thêm phiên bản mới vào “${asset.title}”`}
                    </span>
                </div>
            )}
            {over === 'merge' && (
                <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-violet-950/60">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500 px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-lg">
                        <Layers size={12} /> {busy ? 'Đang bận…' : 'Gộp thành phiên bản mới'}
                    </span>
                </div>
            )}
            <div className="relative w-full bg-black/40" style={{ aspectRatio: aspectCss(aspect) }}>
                <SelectCheckbox checked={selected} onToggle={onToggle} />
                {isReadyVideo ? (
                    <HoverScrub storyboardVttUrl={storyboard} durationMs={v?.durationMs ?? null}>
                        <Poster asset={asset} thumb={thumb} />
                    </HoverScrub>
                ) : (
                    <Poster asset={asset} thumb={thumb} />
                )}

                {state !== 'ready' && <ProcessingOverlay state={state} />}

                {/* version badge — only when ≥2 versions (FR-B05 AC3) */}
                {showVersionBadge && (
                    <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-violet-200 backdrop-blur-sm">
                        v{v.versionNumber}
                    </span>
                )}
                {/* duration overlay — video only, ready */}
                {state === 'ready' && asset.mediaKind === 'video' && dur && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
                        {dur}
                    </span>
                )}
            </div>

            {(showInfo || canRename) && (
                <div className="flex flex-col gap-1 p-2.5">
                    {canRename ? (
                        <InlineRename initial={asset.title} onCommit={onCommitRename} onCancel={onCancelRename} />
                    ) : (
                        <div className="truncate text-[12.5px] font-medium text-zinc-100" title={asset.title}>
                            {asset.title}
                        </div>
                    )}
                    {showInfo && v?.uploadedBy && (
                        <div
                            className="truncate text-[11px] text-muted-foreground"
                            title={`${v.uploadedBy.name} • ${formatDateTime(v.createdAt)}`}
                        >
                            {v.uploadedBy.name} • {formatDate(v.createdAt)}
                        </div>
                    )}
                    {/* [review-fixes BR-04] Bỏ overlay/điều khiển trạng thái trên card
                        (StatusControl popover z-50 + StatusChip) — user muốn không tồn tại dù bật
                        toggle "Hiện thông tin thẻ". Trạng thái task xem ở board/drawer; F2 (P3)
                        auto-đổi qua state machine, không sửa tay trên card asset. Giữ lại 💬n. */}
                    {showInfo && commentCount > 0 && (
                        <div className="mt-0.5 flex items-center justify-end">
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                                <MessageSquare size={11} />
                                {commentCount}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/* ── single-select InfoPanel (FR-B05: read-only technical metadata) ──────── */

export function InfoPanel({
    asset,
    onClose,
    onSetStatus,
    onManageVersions,
}: {
    asset: AssetDto
    onClose: () => void
    onSetStatus?: (statusId: string | null) => void
    onManageVersions?: () => void
}) {
    const v = asset.currentVersion
    const dur = msToClock(v?.durationMs)
    const res = v?.width && v?.height ? `${v.width}×${v.height}` : null
    const fps = v?.fps ? `${Math.round((v.fps.num / v.fps.den) * 100) / 100} fps` : null
    const items: { label: string; value: string }[] = [
        { label: 'Dung lượng', value: v ? bytesLabel(v.sizeBytes) : '—' },
        { label: 'Thời lượng', value: dur ?? '—' },
        { label: 'Độ phân giải', value: res ?? '—' },
        { label: 'FPS', value: fps ?? '—' },
        { label: 'Người tải', value: v?.uploadedBy?.name ?? '—' },
        { label: 'Ngày', value: v ? formatDate(v.createdAt) : '—' },
    ]
    return (
        <div className="mt-3 flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5">
            <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                    <span className="truncate text-[12.5px] font-semibold text-zinc-100" title={asset.title}>
                        {asset.title}
                    </span>
                    {/* [review-fixes BR-04] Bỏ StatusControl/StatusChip khỏi InfoPanel — trạng thái
                        xem ở board/drawer, không sửa tay trên card asset (F2 auto qua state machine). */}
                    {asset.versionCount >= 2 && (
                        <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                            {asset.versionCount} phiên bản
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {items.map((it) => (
                        <span key={it.label}>
                            <span className="text-muted-foreground">{it.label}:</span>{' '}
                            <span className="text-zinc-300">{it.value}</span>
                        </span>
                    ))}
                </div>
            </div>
            {onManageVersions && (
                <button
                    type="button"
                    onClick={onManageVersions}
                    title="Quản lý phiên bản"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11.5px] text-zinc-200 transition-colors hover:bg-white/[0.12]"
                >
                    <Layers size={13} /> Phiên bản
                </button>
            )}
            <button
                type="button"
                onClick={onClose}
                title="Bỏ chọn"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            >
                <X size={15} />
            </button>
        </div>
    )
}
