'use client'

// [Review module P2.5] Multi-select bottom bar (FR-B11). Slides up when ≥1 item is
// selected; shows the count + total size (+ total runtime for assets) with the exact
// copy from UI-UX-SPEC §1.4.7, and the bulk actions Download / Move to / Copy to /
// Delete. "Manage Versions" shows only when exactly one asset is selected (P3.4).
// Esc / the clear button dismiss the selection.

import { Download, FolderInput, CopyPlus, Trash2, X, Layers } from 'lucide-react'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import { bytesLabel } from './TeamCards'

function totalRuntime(assets: AssetDto[]): string | null {
    let ms = 0
    let any = false
    for (const a of assets) {
        const d = a.currentVersion?.durationMs
        if (typeof d === 'number' && d > 0) {
            ms += d
            any = true
        }
    }
    if (!any) return null
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function SelectionBar({
    folders,
    assets,
    atCap,
    canDelete,
    onDownload,
    onMove,
    onCopy,
    onDelete,
    onClear,
    onManageVersions,
}: {
    folders: FolderDto[]
    assets: AssetDto[]
    atCap: boolean
    /** false when the selection has a folder the current user isn't allowed to delete (FR-B07). */
    canDelete: boolean
    onDownload: () => void
    onMove: () => void
    onCopy: () => void
    onDelete: () => void
    onClear: () => void
    /** P3.4 — open Manage Versions for the sole selected asset. */
    onManageVersions?: () => void
}) {
    const nFolders = folders.length
    const nAssets = assets.length
    const total = nFolders + nAssets
    if (total === 0) return null

    let bytes = BigInt(0)
    for (const f of folders) bytes += toBig(f.totalBytes)
    for (const a of assets) bytes += toBig(a.currentVersion?.sizeBytes)
    const sizeLabel = bytesLabel(bytes.toString())
    const runtime = totalRuntime(assets)

    // Copy exactly per §1.4.7: asset-only / folder-only / mixed.
    let label: string
    if (nFolders === 0) {
        label = `Đã chọn ${nAssets} asset • ${sizeLabel}${runtime ? ` • Thời lượng ${runtime}` : ''}`
    } else if (nAssets === 0) {
        label = `Đã chọn ${nFolders} thư mục • ${sizeLabel}`
    } else {
        label = `Đã chọn ${total} mục • ${sizeLabel}`
    }

    const soleAsset = nAssets === 1 && nFolders === 0

    return (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/95 px-3 py-2 shadow-2xl shadow-black/60 backdrop-blur-xl animate-fade-in">
                <button
                    type="button"
                    onClick={onClear}
                    title="Bỏ chọn (Esc)"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                >
                    <X size={15} />
                </button>
                <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-zinc-100">{label}</div>
                    {atCap && <div className="text-[10.5px] text-amber-300/90">Đã đạt giới hạn 200 mục cho một thao tác</div>}
                </div>

                <div className="mx-1 h-6 w-px bg-white/10" />

                <div className="flex items-center gap-1">
                    <BarBtn icon={<Download size={14} />} label="Tải xuống" onClick={onDownload} />
                    <BarBtn icon={<FolderInput size={14} />} label="Di chuyển" onClick={onMove} />
                    <BarBtn icon={<CopyPlus size={14} />} label="Sao chép" onClick={onCopy} />
                    {soleAsset && onManageVersions && (
                        <BarBtn
                            icon={<Layers size={14} />}
                            label="Phiên bản"
                            onClick={onManageVersions}
                            title="Quản lý phiên bản"
                        />
                    )}
                    <BarBtn
                        icon={<Trash2 size={14} />}
                        label="Xóa"
                        onClick={onDelete}
                        danger
                        disabled={!canDelete}
                        title={canDelete ? undefined : 'Có thư mục người khác tạo — chỉ người tạo hoặc quản trị được xóa'}
                    />
                </div>
            </div>
        </div>
    )
}

function toBig(v: string | number | null | undefined): bigint {
    if (v == null) return BigInt(0)
    try {
        return BigInt(typeof v === 'number' ? Math.trunc(v) : v)
    } catch {
        return BigInt(0)
    }
}

function BarBtn({
    icon,
    label,
    onClick,
    danger,
    disabled,
    title,
}: {
    icon: React.ReactNode
    label: string
    onClick?: () => void
    danger?: boolean
    disabled?: boolean
    title?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                danger
                    ? 'text-red-300 hover:bg-red-500/15'
                    : 'text-zinc-200 hover:bg-white/[0.08]'
            }`}
        >
            {icon}
            <span className="hidden sm:inline">{label}</span>
        </button>
    )
}
