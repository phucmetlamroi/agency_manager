'use client'

// [Review module P2.3] Team-browser GRID cards (FR-B05) + single-select InfoPanel.
// Faithful to UI-UX-SPEC §1.4.4/§1.4.5: folder card (icon + name + 'N mục • size'),
// asset card (poster + hover-scrub, version badge only when ≥2 versions, duration
// overlay, name, uploader•date w/ full-datetime tooltip, status chip + 💬N of the
// CURRENT version). Status chip is a PLACEHOLDER (real dropdown = P3). Selection
// checkbox + '…' menu affordances are P2.5, so they are not drawn here yet. Folder
// 2×2 thumbnail preview needs a backend preview feed → deferred (icon shown instead).

import { useState } from 'react'
import { Folder as FolderIcon, Film, Image as ImageIcon, MessageSquare, Loader2, AlertTriangle, X } from 'lucide-react'
import { formatBytes } from '@/lib/review/upload-store'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import type { Aspect, ThumbScale } from '@/lib/review/view-prefs'
import { aspectCss, msToClock, formatDate, formatDateTime, statusColor } from '@/lib/review/view-prefs'
import { HoverScrub } from './HoverScrub'

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
            <span className="truncate">{status}</span>
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
        <div className="absolute inset-0 grid place-items-center text-zinc-600">
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

/* ── FOLDER card ─────────────────────────────────────────────────────────── */

export function FolderCardGrid({
    folder,
    selected,
    onSelect,
    onOpen,
}: {
    folder: FolderDto
    selected: boolean
    onSelect: () => void
    onOpen: () => void
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            onDoubleClick={onOpen}
            className={`group flex flex-col rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 ${
                selected
                    ? 'border-violet-500 bg-violet-500/[0.08]'
                    : 'border-white/5 bg-white/[0.03] hover:border-violet-500/30 hover:bg-white/[0.06]'
            }`}
        >
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <FolderIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-100" title={folder.name}>
                        {folder.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                        {folder.itemCount} mục · {bytesLabel(folder.totalBytes)}
                    </div>
                </div>
            </div>
        </button>
    )
}

/* ── ASSET card ──────────────────────────────────────────────────────────── */

export function AssetCardGrid({
    asset,
    aspect,
    thumb,
    showInfo,
    selected,
    onSelect,
    onOpen,
}: {
    asset: AssetDto
    aspect: Aspect
    thumb: ThumbScale
    showInfo: boolean
    selected: boolean
    onSelect: () => void
    onOpen: () => void
}) {
    const v = asset.currentVersion
    const state = assetState(asset)
    const dur = msToClock(v?.durationMs)
    const showVersionBadge = asset.versionCount >= 2 && v
    const storyboard = v?.media?.storyboardVttUrl
    const isReadyVideo = state === 'ready' && asset.mediaKind === 'video' && !!storyboard
    const commentCount = v?.commentCount ?? 0

    return (
        <div
            onClick={onSelect}
            onDoubleClick={onOpen}
            className={`group flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-all ${
                selected ? 'border-violet-500 bg-violet-500/[0.08]' : 'border-white/5 bg-white/[0.03] hover:border-white/15'
            }`}
        >
            <div className="relative w-full bg-black/40" style={{ aspectRatio: aspectCss(aspect) }}>
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
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-violet-200 backdrop-blur-sm">
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

            {showInfo && (
                <div className="flex flex-col gap-1 p-2.5">
                    <div className="truncate text-[12.5px] font-medium text-zinc-100" title={asset.title}>
                        {asset.title}
                    </div>
                    {v?.uploadedBy && (
                        <div
                            className="truncate text-[11px] text-zinc-500"
                            title={`${v.uploadedBy.name} • ${formatDateTime(v.createdAt)}`}
                        >
                            {v.uploadedBy.name} • {formatDate(v.createdAt)}
                        </div>
                    )}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                        <StatusChip status={asset.statusKey} />
                        {commentCount > 0 && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-zinc-500">
                                <MessageSquare size={11} />
                                {commentCount}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

/* ── single-select InfoPanel (FR-B05: read-only technical metadata) ──────── */

export function InfoPanel({ asset, onClose }: { asset: AssetDto; onClose: () => void }) {
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
                    <StatusChip status={asset.statusKey} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                    {items.map((it) => (
                        <span key={it.label}>
                            <span className="text-zinc-600">{it.label}:</span>{' '}
                            <span className="text-zinc-300">{it.value}</span>
                        </span>
                    ))}
                </div>
            </div>
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
