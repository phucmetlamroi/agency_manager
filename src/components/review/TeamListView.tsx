'use client'

// [Review module P2.3] Team-browser LIST view (FR-B09). 7-column table
// (Tên | Trạng thái | Ngày tải lên | Người tải | Bình luận | Dung lượng | Thời lượng);
// folders always render on top; clicking a column header sorts by that column and
// toggles asc/desc — the SAME shared sort state as the Sort popover (one source of
// truth). Folder rows leave duration/comments blank and show the lazy total size.
// Single-click selects (drives the InfoPanel); double-click opens (folder/player).

import { Folder as FolderIcon, Film, Image as ImageIcon, ChevronUp, ChevronDown } from 'lucide-react'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import type { SortField, SortDir } from '@/lib/review/view-prefs'
import { msToClock, formatDate } from '@/lib/review/view-prefs'
import { bytesLabel, StatusChip } from './TeamCards'

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
                <div className="grid h-full w-full place-items-center text-zinc-600">
                    {asset.mediaKind === 'image' ? <ImageIcon size={14} /> : <Film size={14} />}
                </div>
            )}
        </div>
    )
}

export function TeamListView({
    folders,
    assets,
    sortField,
    sortDir,
    onSort,
    selectedId,
    onSelect,
    onOpenFolder,
    onOpenAsset,
}: {
    folders: FolderDto[]
    assets: AssetDto[]
    sortField: SortField
    sortDir: SortDir
    onSort: (field: SortField) => void
    selectedId: string | null
    onSelect: (id: string) => void
    onOpenFolder: (id: string) => void
    onOpenAsset: (asset: AssetDto) => void
}) {
    const rowCls = (id: string) =>
        `cursor-pointer border-b border-white/[0.04] transition-colors ${
            selectedId === id ? 'bg-violet-500/[0.10]' : 'hover:bg-white/[0.04]'
        }`

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                    <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
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
                            className={rowCls(f.id)}
                            onClick={() => onSelect(f.id)}
                            onDoubleClick={() => onOpenFolder(f.id)}
                        >
                            <td className="px-3 py-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="grid h-9 w-14 shrink-0 place-items-center rounded bg-violet-500/10 text-violet-300">
                                        <FolderIcon size={16} />
                                    </div>
                                    <span className="truncate font-medium text-zinc-100" title={f.name}>
                                        {f.name}
                                    </span>
                                </div>
                            </td>
                            <td className="px-3 py-2 text-zinc-600">—</td>
                            <td className="px-3 py-2 text-zinc-400">{formatDate(f.createdAt)}</td>
                            <td className="px-3 py-2 text-zinc-400">{f.createdBy?.name ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-zinc-600">—</td>
                            <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{bytesLabel(f.totalBytes)}</td>
                            <td className="px-3 py-2 text-right text-zinc-600">—</td>
                        </tr>
                    ))}
                    {assets.map((a) => {
                        const v = a.currentVersion
                        const dur = msToClock(v?.durationMs)
                        return (
                            <tr
                                key={`a-${a.id}`}
                                className={rowCls(a.id)}
                                onClick={() => onSelect(a.id)}
                                onDoubleClick={() => onOpenAsset(a)}
                            >
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2.5">
                                        <Thumb asset={a} />
                                        <span className="truncate font-medium text-zinc-100" title={a.title}>
                                            {a.title}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-3 py-2">
                                    <StatusChip status={a.statusKey} />
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
