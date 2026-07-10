'use client'

// [Review module P2.3/P2.5] Team-browser LIST view (FR-B09). 7-column table
// (Tên | Trạng thái | Ngày tải lên | Người tải | Bình luận | Dung lượng | Thời lượng);
// folders always render on top; clicking a column header sorts by that column and
// toggles asc/desc — the SAME shared sort state as the Sort popover (one source of
// truth). Folder rows leave duration/comments blank and show the lazy total size.
// P2.5: a leading select column (+ select-all header), row data-attrs for the shared
// context menu, modifier-aware row click for multi-select, and inline rename.

import { Folder as FolderIcon, Film, Image as ImageIcon, ChevronUp, ChevronDown, Check } from 'lucide-react'
import { type MouseEvent as ReactMouseEvent } from 'react'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import type { SortField, SortDir } from '@/lib/review/view-prefs'
import { msToClock, formatDate } from '@/lib/review/view-prefs'
import { bytesLabel, StatusChip, InlineRename } from './TeamCards'
import { StatusControl } from './StatusControl'

interface Col {
    key: SortField
    label: string
    align?: 'right'
    className?: string
}

const COLS: Col[] = [
    { key: 'name', label: 'Tên' },
    { key: 'status', label: 'Trạng thái' },
    { key: 'createdAt', label: 'Ngày tải lên' },
    { key: 'uploader', label: 'Người tải' },
    { key: 'commentCount', label: 'Bình luận', align: 'right' },
    { key: 'sizeBytes', label: 'Dung lượng', align: 'right' },
    { key: 'duration', label: 'Thời lượng', align: 'right' },
]

function Thumb({ asset }: { asset: AssetDto }) {
    const poster = asset.currentVersion?.media?.posterUrl
    return (
        <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded bg-black/40">
            {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={poster}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground">
                    {asset.mediaKind === 'image' ? <ImageIcon size={14} /> : <Film size={14} />}
                </div>
            )}
        </div>
    )
}

function RowCheck({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-label={checked ? 'Bỏ chọn' : 'Chọn'}
            onClick={(e) => {
                e.stopPropagation()
                onToggle()
            }}
            className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-all ${
                checked
                    ? 'border-violet-400 bg-violet-500 text-white opacity-100'
                    : 'border-white/40 bg-black/30 text-transparent opacity-0 group-hover:opacity-100'
            }`}
        >
            <Check size={12} strokeWidth={3} />
        </button>
    )
}

export function TeamListView({
    folders,
    assets,
    sortField,
    sortDir,
    onSort,
    selectedIds,
    onRowClick,
    onToggle,
    onSelectAllVisible,
    allVisibleSelected,
    renamingId,
    onCommitRename,
    onCancelRename,
    onOpenFolder,
    onOpenAsset,
    onSetStatus,
}: {
    folders: FolderDto[]
    assets: AssetDto[]
    sortField: SortField
    sortDir: SortDir
    onSort: (field: SortField) => void
    selectedIds: Set<string>
    onRowClick: (id: string, e: ReactMouseEvent) => void
    onToggle: (id: string) => void
    onSelectAllVisible: () => void
    allVisibleSelected: boolean
    renamingId: string | null
    onCommitRename: (name: string) => void
    onCancelRename: () => void
    onOpenFolder: (id: string) => void
    onOpenAsset: (asset: AssetDto) => void
    /** P3.5 — set/clear a row's card status. Read-only chip when omitted. */
    onSetStatus?: (assetId: string, statusId: string | null) => void
}) {
    const rowCls = (id: string) =>
        `group cursor-pointer border-b border-white/[0.04] transition-colors ${
            selectedIds.has(id) ? 'bg-violet-500/[0.10]' : 'hover:bg-white/[0.04]'
        }`

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                    <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="w-9 px-3 py-2">
                            <button
                                type="button"
                                aria-label={allVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                onClick={onSelectAllVisible}
                                className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                                    allVisibleSelected
                                        ? 'border-violet-400 bg-violet-500 text-white'
                                        : 'border-white/40 bg-black/30 text-transparent hover:border-white/60'
                                }`}
                            >
                                <Check size={12} strokeWidth={3} />
                            </button>
                        </th>
                        {COLS.map((c) => {
                            const activeSort = sortField === c.key
                            return (
                                <th
                                    key={c.key}
                                    onClick={() => onSort(c.key)}
                                    className={`select-none px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} cursor-pointer hover:text-zinc-300`}
                                >
                                    <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                                        {c.label}
                                        {activeSort &&
                                            (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                    </span>
                                </th>
                            )
                        })}
                    </tr>
                </thead>
                <tbody className="text-[12.5px]">
                    {folders.map((f) => (
                        <tr
                            key={`f-${f.id}`}
                            data-review-id={f.id}
                            data-review-type="folder"
                            className={rowCls(f.id)}
                            onClick={(e) => onRowClick(f.id, e)}
                            onDoubleClick={() => renamingId !== f.id && onOpenFolder(f.id)}
                        >
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                <RowCheck checked={selectedIds.has(f.id)} onToggle={() => onToggle(f.id)} />
                            </td>
                            <td className="px-3 py-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="grid h-9 w-14 shrink-0 place-items-center rounded bg-violet-500/10 text-violet-300">
                                        <FolderIcon size={16} />
                                    </div>
                                    {renamingId === f.id ? (
                                        <div className="min-w-0 flex-1">
                                            <InlineRename initial={f.name} onCommit={onCommitRename} onCancel={onCancelRename} />
                                        </div>
                                    ) : (
                                        <span className="truncate font-medium text-zinc-100" title={f.name}>
                                            {f.name}
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-zinc-400">{formatDate(f.createdAt)}</td>
                            <td className="px-3 py-2 text-zinc-400">{f.createdBy?.name ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{bytesLabel(f.totalBytes)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                        </tr>
                    ))}
                    {assets.map((a) => {
                        const v = a.currentVersion
                        const dur = msToClock(v?.durationMs)
                        return (
                            <tr
                                key={`a-${a.id}`}
                                data-review-id={a.id}
                                data-review-type="asset"
                                className={rowCls(a.id)}
                                onClick={(e) => onRowClick(a.id, e)}
                                onDoubleClick={() => renamingId !== a.id && onOpenAsset(a)}
                            >
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                    <RowCheck checked={selectedIds.has(a.id)} onToggle={() => onToggle(a.id)} />
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2.5">
                                        <Thumb asset={a} />
                                        {renamingId === a.id ? (
                                            <div className="min-w-0 flex-1">
                                                <InlineRename initial={a.title} onCommit={onCommitRename} onCancel={onCancelRename} />
                                            </div>
                                        ) : (
                                            <span className="truncate font-medium text-zinc-100" title={a.title}>
                                                {a.title}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2" onClick={(e) => onSetStatus && e.stopPropagation()}>
                                    {onSetStatus ? (
                                        <StatusControl status={a.statusKey} onPick={(s) => onSetStatus(a.id, s)} align="start" />
                                    ) : (
                                        <StatusChip status={a.statusKey} />
                                    )}
                                </td>
                                <td className="px-3 py-2 text-zinc-400">{v ? formatDate(v.createdAt) : '—'}</td>
                                <td className="px-3 py-2 text-zinc-400">{v?.uploadedBy?.name ?? '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                                    {v && v.commentCount > 0 ? v.commentCount : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                                    {v ? bytesLabel(v.sizeBytes) : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{dur ?? '—'}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
