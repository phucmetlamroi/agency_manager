'use client'

// [Review module P3.4] Manage Versions modal (FR-C02 / UI-UX-SPEC §3). Lists a stack's
// live versions newest → oldest (append-only — NO reorder). Each row: version badge,
// thumbnail, original filename, uploader • date, comment count, size/duration, and a "…"
// menu (Tải xuống / Tách khỏi stack / Xóa phiên bản). Remove + Delete are hidden when the
// stack has a single version (you'd use "Xóa asset" instead — FR-C02 AC). Clicking a row
// opens the player deep-link (P4 — degrades to a toast until the player ships). Deleting the
// last live version trashes the whole stack → the modal closes and the grid refreshes.

import { useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { toast } from 'sonner'
import {
    Film,
    Image as ImageIcon,
    MessageSquare,
    Loader2,
    AlertTriangle,
    X,
    MoreHorizontal,
    Download,
    Scissors,
    Trash2,
    Layers,
} from 'lucide-react'
import {
    listAssetVersions,
    apiDeleteVersion,
    apiRemoveFromStack,
    downloadVersion,
    type AssetVersions,
    type VersionRow,
} from '@/lib/review/team-actions'
import { formatDate, formatDateTime, msToClock } from '@/lib/review/view-prefs'
import { bytesLabel } from './TeamCards'

type PendingAction = { version: VersionRow; kind: 'delete' | 'remove' } | null

export function ManageVersionsModal({
    assetId,
    open,
    onClose,
    onChanged,
    onOpenVersion,
}: {
    assetId: string
    open: boolean
    onClose: () => void
    /** Called after a delete / remove-from-stack mutates the stack, so the grid can refresh. */
    onChanged?: () => void
    /** Click a row → open the player at this version (P4). */
    onOpenVersion?: (versionId: string) => void
}) {
    const [data, setData] = useState<AssetVersions | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [pending, setPending] = useState<PendingAction>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setData(await listAssetVersions(assetId))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Không tải được danh sách phiên bản.')
        } finally {
            setLoading(false)
        }
    }, [assetId])

    useEffect(() => {
        if (open) void load()
    }, [open, load])

    const versions = data?.versions ?? []
    const single = versions.length <= 1

    const doDownload = useCallback(async (v: VersionRow) => {
        setBusyId(v.id)
        const tid = toast.loading('Đang chuẩn bị tải xuống…')
        try {
            if (v.uploadStatus !== 'ready') {
                toast.error('Phiên bản chưa xử lý xong — chưa tải được.', { id: tid })
                return
            }
            await downloadVersion(v.id)
            toast.success('Đã bắt đầu tải.', { id: tid })
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Tải xuống thất bại.', { id: tid })
        } finally {
            setBusyId(null)
        }
    }, [])

    const runPending = useCallback(async () => {
        if (!pending) return
        const { version, kind } = pending
        setPending(null)
        setBusyId(version.id)
        const tid = toast.loading(kind === 'delete' ? 'Đang xóa phiên bản…' : 'Đang tách phiên bản…')
        try {
            if (kind === 'delete') {
                const r = await apiDeleteVersion(version.id)
                toast.success('Đã chuyển vào “Đã xóa gần đây”.', { id: tid })
                onChanged?.()
                if (r.stackDeleted) {
                    onClose()
                    return
                }
            } else {
                await apiRemoveFromStack(version.id)
                toast.success('Đã tách thành asset riêng.', { id: tid })
                onChanged?.()
            }
            await load()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Thao tác thất bại.', { id: tid })
        } finally {
            setBusyId(null)
        }
    }, [pending, load, onChanged, onClose])

    return (
        <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content
                    className="fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[900px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
                    style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
                >
                    {/* header */}
                    <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                            <Layers size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <Dialog.Title className="truncate text-[14px] font-semibold text-zinc-100">
                                Quản lý phiên bản{data ? ` — ${data.asset.name}` : ''}
                            </Dialog.Title>
                            <Dialog.Description className="mt-0.5 text-[11.5px] text-muted-foreground">
                                {versions.length > 0
                                    ? `${versions.length} phiên bản · mới nhất ở trên cùng`
                                    : 'Danh sách các bản dựng của asset này'}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close asChild>
                            <button
                                type="button"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
                            >
                                <X size={17} />
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* body */}
                    <div className="min-h-[220px] flex-1 overflow-y-auto p-3">
                        {loading ? (
                            <div className="flex flex-col gap-2">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-[76px] animate-pulse rounded-xl border border-white/5 bg-white/[0.03]" />
                                ))}
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                                    <AlertTriangle size={20} />
                                </div>
                                <p className="max-w-sm text-[13px] text-zinc-400">{error}</p>
                                <button
                                    type="button"
                                    onClick={() => void load()}
                                    className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] text-zinc-200 transition-colors hover:bg-white/[0.12]"
                                >
                                    Thử lại
                                </button>
                            </div>
                        ) : versions.length === 0 ? (
                            <div className="py-14 text-center text-[13px] text-muted-foreground">Chưa có phiên bản nào.</div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {versions.map((v) => (
                                    <VersionRowItem
                                        key={v.id}
                                        version={v}
                                        mediaKind={data!.asset.mediaKind}
                                        single={single}
                                        busy={busyId === v.id}
                                        onOpen={onOpenVersion ? () => onOpenVersion(v.id) : undefined}
                                        onDownload={() => void doDownload(v)}
                                        onRemove={() => setPending({ version: v, kind: 'remove' })}
                                        onDelete={() => setPending({ version: v, kind: 'delete' })}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* inline confirm for destructive per-row actions */}
                    {pending && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
                            <div className="w-[360px] max-w-full rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl shadow-black/70">
                                <div className="mb-2.5 flex items-center gap-2.5">
                                    <div
                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                            pending.kind === 'delete' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'
                                        }`}
                                    >
                                        {pending.kind === 'delete' ? <Trash2 size={17} /> : <Scissors size={17} />}
                                    </div>
                                    <div className="text-[14px] font-semibold text-zinc-100">
                                        {pending.kind === 'delete' ? 'Xóa phiên bản này?' : 'Tách khỏi stack?'}
                                    </div>
                                </div>
                                <p className="mb-5 text-[12.5px] leading-relaxed text-zinc-400">
                                    {pending.kind === 'delete'
                                        ? `Phiên bản v${pending.version.versionNumber} sẽ chuyển vào “Đã xóa gần đây” — khôi phục được trong 30 ngày, sau đó xóa vĩnh viễn.`
                                        : `Phiên bản v${pending.version.versionNumber} sẽ trở thành một asset riêng trong cùng thư mục. Bình luận sẽ đi theo phiên bản.`}
                                </p>
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPending(null)}
                                        className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void runPending()}
                                        className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-colors ${
                                            pending.kind === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
                                        }`}
                                    >
                                        {pending.kind === 'delete' ? <Trash2 size={14} /> : <Scissors size={14} />}
                                        {pending.kind === 'delete' ? 'Xóa' : 'Tách'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

function VersionRowItem({
    version: v,
    mediaKind,
    single,
    busy,
    onOpen,
    onDownload,
    onRemove,
    onDelete,
}: {
    version: VersionRow
    mediaKind: 'video' | 'image'
    single: boolean
    busy: boolean
    onOpen?: () => void
    onDownload: () => void
    onRemove: () => void
    onDelete: () => void
}) {
    const poster = v.media?.posterUrl
    const dur = msToClock(v.durationMs)
    const notReady = v.uploadStatus !== 'ready'

    return (
        <div
            className={`group flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                v.isCurrent ? 'border-violet-500/40 bg-violet-500/[0.06]' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
        >
            {/* thumb (click → player) */}
            <button
                type="button"
                onClick={onOpen}
                disabled={!onOpen}
                className="relative aspect-video w-[128px] shrink-0 overflow-hidden rounded-lg bg-black/40 outline-none disabled:cursor-default"
                title={onOpen ? 'Mở phiên bản' : undefined}
            >
                {poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                    <span className="grid h-full w-full place-items-center text-muted-foreground">
                        {mediaKind === 'image' ? <ImageIcon size={20} /> : <Film size={20} />}
                    </span>
                )}
                {notReady && (
                    <span className="absolute inset-0 grid place-items-center bg-black/50 text-[10px] text-zinc-300">
                        {v.uploadStatus === 'failed' ? 'Lỗi' : 'Đang xử lý…'}
                    </span>
                )}
                {dur && !notReady && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-px text-[9.5px] font-medium tabular-nums text-white">
                        {dur}
                    </span>
                )}
            </button>

            {/* meta */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-200">
                        v{v.versionNumber}
                    </span>
                    {v.isCurrent && (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-300">
                            Hiện tại
                        </span>
                    )}
                    <span className="truncate text-[12.5px] font-medium text-zinc-100" title={v.originalName}>
                        {v.originalName}
                    </span>
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground" title={formatDateTime(v.createdAt)}>
                    {v.uploadedBy?.name ? `${v.uploadedBy.name} · ` : ''}
                    {formatDate(v.createdAt)} · {bytesLabel(v.sizeBytes)}
                </div>
            </div>

            {/* comment count */}
            {v.commentCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
                    <MessageSquare size={12} />
                    {v.commentCount}
                </span>
            )}

            {/* row menu */}
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        disabled={busy}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 outline-none transition-colors hover:bg-white/[0.08] hover:text-zinc-100 disabled:opacity-50"
                        title="Thao tác phiên bản"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={16} />}
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="end"
                        className="z-[60] min-w-[190px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl"
                    >
                        <MenuItem icon={<Download size={14} />} label="Tải phiên bản này" onSelect={onDownload} />
                        {!single && (
                            <>
                                <MenuItem icon={<Scissors size={14} />} label="Tách khỏi stack" onSelect={onRemove} />
                                <DropdownMenu.Separator className="my-1 h-px bg-white/[0.07]" />
                                <MenuItem icon={<Trash2 size={14} />} label="Xóa phiên bản" onSelect={onDelete} danger />
                            </>
                        )}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
        </div>
    )
}

function MenuItem({
    icon,
    label,
    onSelect,
    danger,
}: {
    icon: React.ReactNode
    label: string
    onSelect: () => void
    danger?: boolean
}) {
    return (
        <DropdownMenu.Item
            onSelect={onSelect}
            className={`flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12.5px] outline-none transition-colors ${
                danger
                    ? 'text-red-300 data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-200'
                    : 'text-zinc-200 data-[highlighted]:bg-violet-500/15 data-[highlighted]:text-white'
            }`}
        >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-400">{icon}</span>
            {label}
        </DropdownMenu.Item>
    )
}
