'use client'

// [Review module P2.4] Team-browser upload UI pieces: the '+ Mới ▾' menu, the
// optimistic New-Folder tile with inline rename, the live uploading/processing
// placeholder card, and the drag-drop overlay. State/orchestration live in
// TeamBrowser; these are presentational + engine-control (cancel/retry) only.

import { useEffect, useRef, useState } from 'react'
import {
    Plus,
    UploadCloud,
    FolderUp,
    FolderPlus,
    Folder as FolderIcon,
    Film,
    Image as ImageIcon,
    Loader2,
    AlertTriangle,
    X,
    RotateCcw,
    Pause,
    Play,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { uploadEngine } from '@/lib/review/upload-engine'
import { formatBytes, type UploadItem } from '@/lib/review/upload-store'
import type { Aspect } from '@/lib/review/view-prefs'
import { aspectCss } from '@/lib/review/view-prefs'

/* ── "+ Mới ▾" menu (UI-UX-SPEC §1.4.3.4) ─────────────────────────────────── */

export function NewMenu({
    onUploadFiles,
    onUploadFolder,
    onNewFolder,
}: {
    onUploadFiles: () => void
    onUploadFolder: () => void
    onNewFolder: () => void
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90"
                >
                    <Plus size={14} /> Mới
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-52 border-white/10 bg-zinc-950/95 text-zinc-200 backdrop-blur-xl"
            >
                <DropdownMenuItem onSelect={onUploadFiles} className="gap-2 text-[13px] focus:bg-white/[0.06]">
                    <UploadCloud size={15} className="text-violet-300" /> Tải asset lên
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onUploadFolder} className="gap-2 text-[13px] focus:bg-white/[0.06]">
                    <FolderUp size={15} className="text-violet-300" /> Tải thư mục lên
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onSelect={onNewFolder} className="gap-2 text-[13px] focus:bg-white/[0.06]">
                    <FolderPlus size={15} className="text-violet-300" /> Thư mục mới
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/* ── optimistic New-Folder tile (inline rename, §0.4.3 + §1.4.10) ─────────── */

const DEFAULT_FOLDER_NAME = 'Untitled Folder'

export function NewFolderTile({ onCommit }: { onCommit: (name: string) => void }) {
    const [value, setValue] = useState(DEFAULT_FOLDER_NAME)
    const inputRef = useRef<HTMLInputElement>(null)
    const committedRef = useRef(false)

    useEffect(() => {
        const el = inputRef.current
        if (el) {
            el.focus()
            el.select() // full text pre-selected — type-over renames
        }
    }, [])

    const commit = (name: string) => {
        if (committedRef.current) return
        committedRef.current = true
        onCommit(name.trim() || DEFAULT_FOLDER_NAME)
    }

    return (
        <div className="flex flex-col rounded-xl border border-violet-500/50 bg-violet-500/[0.06] p-3">
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <FolderIcon size={20} />
                </div>
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault()
                            commit(value)
                        } else if (e.key === 'Escape') {
                            e.preventDefault()
                            commit(DEFAULT_FOLDER_NAME) // Esc keeps the default name (still creates)
                        }
                    }}
                    onBlur={() => commit(value)}
                    maxLength={255}
                    className="min-w-0 flex-1 rounded-md border border-violet-500/40 bg-black/40 px-2 py-1 text-[13px] font-medium text-zinc-100 outline-none focus:border-violet-400"
                />
            </div>
        </div>
    )
}

/* ── live uploading / processing placeholder card (§1.5) ──────────────────── */

function Ring({ pct }: { pct: number }) {
    const r = 15
    const c = 2 * Math.PI * r
    const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100)
    return (
        <svg width={40} height={40} viewBox="0 0 40 40" className="rotate-[-90deg]">
            <circle cx={20} cy={20} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
            <circle
                cx={20}
                cy={20}
                r={r}
                fill="none"
                stroke="#8B5CF6"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={off}
            />
        </svg>
    )
}

export function UploadingCard({ item, aspect, showInfo }: { item: UploadItem; aspect: Aspect; showInfo: boolean }) {
    const pct = item.sizeBytes > 0 ? Math.floor((Math.min(item.bytesUploaded, item.sizeBytes) / item.sizeBytes) * 100) : 0
    const isFailed = item.status === 'failed'
    const isProcessing = item.status === 'processing' || item.status === 'completing'
    const isPaused = item.status === 'paused'
    const KindIcon = item.kind === 'IMAGE' ? ImageIcon : Film

    return (
        <div
            className={`flex flex-col overflow-hidden rounded-xl border ${
                isFailed ? 'border-red-500/40' : 'border-white/5'
            } bg-white/[0.03]`}
        >
            <div className="relative w-full bg-black/50" style={{ aspectRatio: aspectCss(aspect) }}>
                <div className="absolute inset-0 grid place-items-center gap-1.5 text-center">
                    {isFailed ? (
                        <>
                            <AlertTriangle size={20} className="text-red-300" />
                            <span className="px-2 text-[11px] text-red-200">{item.error || 'Tải lên thất bại'}</span>
                        </>
                    ) : isProcessing ? (
                        <>
                            <Loader2 size={20} className="animate-spin text-violet-300" />
                            <span className="text-[11px] text-zinc-300">
                                {item.status === 'completing' ? 'Đang hoàn tất…' : 'Đang xử lý…'}
                            </span>
                        </>
                    ) : (
                        <>
                            <div className="relative grid place-items-center">
                                <Ring pct={pct} />
                                <span className="absolute text-[10px] font-semibold tabular-nums text-zinc-100">{pct}%</span>
                            </div>
                            <span className="text-[11px] text-zinc-400">
                                {isPaused ? 'Đã tạm dừng' : `Đang tải lên… ${pct}%`}
                            </span>
                        </>
                    )}
                </div>
                {/* control row */}
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                    {isFailed && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.retry(item.id)}
                            title="Thử lại"
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-200 hover:bg-black/80"
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                    {(item.status === 'uploading' || item.status === 'queued') && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.pause(item.id)}
                            title="Tạm dừng"
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-200 hover:bg-black/80"
                        >
                            <Pause size={12} />
                        </button>
                    )}
                    {isPaused && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.resume(item.id)}
                            title="Tiếp tục"
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-200 hover:bg-black/80"
                        >
                            <Play size={12} />
                        </button>
                    )}
                    {!isProcessing && (
                        <button
                            type="button"
                            onClick={() => uploadEngine.cancel(item.id)}
                            title="Hủy upload"
                            className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-zinc-200 hover:bg-black/80 hover:text-red-300"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>
            {showInfo && (
                <div className="flex items-center gap-1.5 p-2.5">
                    <KindIcon size={13} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300" title={item.name}>
                        {item.name}
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
                </div>
            )}
        </div>
    )
}

/* ── drag-drop overlay (§1.5 'Thả để tải lên') ────────────────────────────── */

export function DropOverlay({ folderName }: { folderName: string }) {
    return (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-violet-400/70 bg-violet-500/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud size={30} className="text-violet-200" />
                <span className="text-[14px] font-semibold text-violet-100">Thả để tải lên “{folderName}”</span>
            </div>
        </div>
    )
}
