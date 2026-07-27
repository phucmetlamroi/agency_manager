'use client'

// [Review module P2.6] Recently Deleted (FR-B13 — view + restore). Lists the workspace's
// trashed folders/assets (each soft-delete subtree is ONE entry via deleteBatchId), with a
// 30-day auto-purge countdown, who deleted it, and Restore (single + bulk, unlimited). The
// backend (listTrash / restoreItems) already exists from P2.1; this is the UI + wiring.
// Restore re-homes to the workspace root when the original parent is gone (movedToRoot →
// toast says so). Permanent delete / purge is NOT here — that's the P6 cron.
//
// Pagination: the list follows nextCursor via "Tải thêm" so NO deleted entry becomes
// unreachable (and thus unrestorable before purge). Selection is capped at RESTORE_CAP to
// stay within the restore route's 200-item limit; one global `restoringKey` guard prevents
// a row-restore + bulk-restore firing overlapping calls for the same item.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
    Trash2,
    Folder as FolderIcon,
    Film,
    ChevronLeft,
    RotateCcw,
    Loader2,
    AlertTriangle,
    Check,
    Clock,
    RefreshCw,
} from 'lucide-react'
import { X } from 'lucide-react'
import { bytesLabel } from './TeamCards'
import {
    apiPurgeItems,
    apiRestoreItems,
    type ItemKind,
    type ItemRef,
    type TrashItemKind,
    type TrashItemRef,
} from '@/lib/review/team-actions'
import { REVIEW_MODULE_LABEL } from '@/lib/review/labels'

const RESTORE_CAP = 200 // restore route caps items at 200
const BULK_KEY = '__bulk__'
const PURGE_BULK_KEY = '__purge_bulk__'

interface TrashItem {
    type: TrashItemKind
    id: string
    name: string
    deletedAt: string
    purgeAt: string
    deletedBy: { id: string; name: string; avatarUrl: string | null } | null
    restorable: boolean
    meta: { itemCount?: number; sizeBytes?: string; versionCount?: number; liveDescendants?: number }
}
interface TrashResult {
    items: TrashItem[]
    total: number
    nextCursor: string | null
}

async function errMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body?.error?.message) return body.error.message
    } catch {
        /* non-JSON */
    }
    return `Lỗi ${res.status}. Vui lòng thử lại.`
}

/** Whole days until purge (ceil), from purgeAt. Negative/0 → 0 (grace: still restorable). */
function daysLeft(purgeAt: string): number {
    const ms = new Date(purgeAt).getTime() - Date.now()
    if (!Number.isFinite(ms)) return 0
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

function CountdownChip({ purgeAt }: { purgeAt: string }) {
    const n = daysLeft(purgeAt)
    const urgent = n <= 3
    const label = n <= 0 ? 'Sắp bị xóa' : n === 1 ? 'Còn 1 ngày' : `Còn ${n} ngày`
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                urgent ? 'bg-red-500/12 text-red-300' : 'bg-white/[0.06] text-zinc-400'
            }`}
            title={`Tự động xóa vĩnh viễn ${new Date(purgeAt).toLocaleString('vi-VN')}`}
        >
            <Clock size={11} />
            {label}
        </span>
    )
}

async function fetchTrash(workspaceId: string, cursor: string | null): Promise<TrashResult> {
    const qs = new URLSearchParams({ workspaceId })
    if (cursor) qs.set('cursor', cursor)
    const res = await fetch(`/api/review/trash?${qs.toString()}`, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) throw new Error(await errMessage(res))
    return (await res.json()) as TrashResult
}

// [Giao diện 2 · MC M22] `backHref` = đích nút ← (mặc định /team → GĐ1 byte-identical); MC truyền /mc/tep.
// [MC M26] `chromeless` ẩn tiêu đề H1 "Thùng rác" + nút ← (khi nhúng trong shell Thùng-rác-gộp 4 tab
// đã tự mang header + tab bar) — defaulted OFF → /team/trash + /mc/trash-standalone (M22) byte-identical.
export function TeamTrash({ workspaceId, isAdmin = false, backHref, chromeless = false }: { workspaceId: string; isAdmin?: boolean; backHref?: string; chromeless?: boolean }) {
    const [data, setData] = useState<TrashResult | null>(null) // items ACCUMULATE across pages
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [restoringKey, setRestoringKey] = useState<string | null>(null) // item id | BULK_KEY | null
    // P6.2 Delete-forever (ADMIN): a confirm modal, then a single-guard purge call.
    const [purgingKey, setPurgingKey] = useState<string | null>(null) // item id | PURGE_BULK_KEY | null
    const [purgeConfirm, setPurgeConfirm] = useState<{ refs: ItemRef[]; label: string; key: string } | null>(null)

    const teamHref = backHref ?? `/${workspaceId}/team`

    // initial load (+ manual reload) — replaces the accumulated list with page 1.
    useEffect(() => {
        let alive = true
        setLoading(true)
        setError(null)
        fetchTrash(workspaceId, null)
            .then((body) => {
                if (!alive) return
                setData(body)
                setSelectedIds(new Set())
            })
            .catch((e) => {
                if (alive) setError(e instanceof Error ? e.message : 'Không tải được thùng rác.')
            })
            .finally(() => {
                if (alive) setLoading(false)
            })
        return () => {
            alive = false
        }
    }, [workspaceId, refreshKey])

    const items = useMemo(() => data?.items ?? [], [data])
    const restorable = useMemo(() => items.filter((i) => i.restorable), [items])
    const allSelected = restorable.length > 0 && restorable.every((i) => selectedIds.has(i.id))
    const anySelected = selectedIds.size > 0
    const nextCursor = data?.nextCursor ?? null

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore) return
        setLoadingMore(true)
        try {
            const more = await fetchTrash(workspaceId, nextCursor)
            setData((prev) =>
                prev
                    ? { items: [...prev.items, ...more.items], total: more.total, nextCursor: more.nextCursor }
                    : more,
            )
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Không tải thêm được.')
        } finally {
            setLoadingMore(false)
        }
    }, [workspaceId, nextCursor, loadingMore])

    const capNotice = useCallback((n: number): boolean => {
        if (n <= RESTORE_CAP) return true
        toast(`Chỉ chọn tối đa ${RESTORE_CAP} mục cho một lần khôi phục.`)
        return false
    }, [])

    const toggle = useCallback(
        (id: string) => {
            // Compute outside the state updater so the cap toast (a side effect) never runs
            // during a render pass (StrictMode double-invoke safety).
            const next = new Set(selectedIds)
            if (next.has(id)) next.delete(id)
            else {
                if (!capNotice(next.size + 1)) return
                next.add(id)
            }
            setSelectedIds(next)
        },
        [selectedIds, capNotice],
    )

    const toggleAll = useCallback(() => {
        if (anySelected) setSelectedIds(new Set())
        else {
            const ids = restorable.map((i) => i.id)
            if (ids.length > RESTORE_CAP) toast(`Chỉ chọn tối đa ${RESTORE_CAP} mục — đã chọn ${RESTORE_CAP} mục đầu.`)
            setSelectedIds(new Set(ids.slice(0, RESTORE_CAP)))
        }
    }, [anySelected, restorable])

    const doRestore = useCallback(
        async (refs: TrashItemRef[], key: string) => {
            if (refs.length === 0 || restoringKey) return // single global guard → no overlapping calls
            setRestoringKey(key)
            const tid = toast.loading('Đang khôi phục…')
            try {
                const { restored } = await apiRestoreItems(refs)
                const toRoot = restored.filter((r) => r.movedToRoot).length
                const msg =
                    `Đã khôi phục ${restored.length} mục.` +
                    (toRoot > 0 ? ` (${toRoot} mục về gốc ${REVIEW_MODULE_LABEL} vì thư mục gốc đã bị xóa)` : '')
                toast.success(msg, { id: tid })
                setSelectedIds(new Set())
                setRefreshKey((k) => k + 1)
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Khôi phục thất bại.', { id: tid })
            } finally {
                setRestoringKey(null)
            }
        },
        [restoringKey],
    )

    const restoreSelected = useCallback(() => {
        const refs: TrashItemRef[] = items
            .filter((i) => selectedIds.has(i.id) && i.restorable)
            .slice(0, RESTORE_CAP)
            .map((i) => ({ type: i.type, id: i.id }))
        void doRestore(refs, BULK_KEY)
    }, [items, selectedIds, doRestore])

    // P6.2 — the actual purge call once the confirm modal is accepted.
    const doPurge = useCallback(
        async (refs: ItemRef[], key: string) => {
            if (refs.length === 0) return
            setPurgeConfirm(null)
            setPurgingKey(key)
            const tid = toast.loading('Đang xóa vĩnh viễn…')
            try {
                const r = await apiPurgeItems(refs)
                // [audit 2026-07-27 · MED] A blocked folder used to come back as a green
                // "Đã xóa vĩnh viễn 0 asset · 0 thư mục" while the row stayed put on refresh — the
                // admin could not tell whether the action had worked, retried, and got the same
                // nothing. Say plainly what survived and why.
                const stuck = r.blocked?.filter((b) => b.reason === 'has_live_descendants') ?? []
                const failed = r.blocked?.filter((b) => b.reason === 'delete_failed') ?? []
                if (stuck.length) {
                    toast.error(
                        `Chưa xóa được ${stuck.length} thư mục — bên trong vẫn còn nội dung đang hoạt động. ` +
                            'Hãy khôi phục thư mục rồi xử lý nội dung bên trong trước.',
                        { id: tid, duration: 8000 },
                    )
                } else if (failed.length) {
                    toast.error(`Không xóa được ${failed.length} thư mục. Thử lại sau.`, { id: tid })
                } else {
                    toast.success(`Đã xóa vĩnh viễn ${r.assets} asset · ${r.folders} thư mục.`, { id: tid })
                }
                setSelectedIds(new Set())
                setRefreshKey((k) => k + 1)
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Xóa vĩnh viễn thất bại.', { id: tid })
            } finally {
                setPurgingKey(null)
            }
        },
        [],
    )

    const purgeSelected = useCallback(() => {
        // "Xóa vĩnh viễn" is folder/asset only — the purge endpoint has no version branch, so a
        // version row is simply left to the 30-day cron, which is exactly the promise made when it
        // was deleted. Drop them from the selection rather than sending a payload the API rejects.
        const selected = items.filter((i) => selectedIds.has(i.id))
        const refs: ItemRef[] = selected
            .filter((i): i is typeof i & { type: ItemKind } => i.type !== 'version')
            .map((i) => ({ type: i.type, id: i.id }))
        const skipped = selected.length - refs.length
        if (skipped > 0) toast.info(`${skipped} phiên bản sẽ tự xóa khi hết 30 ngày — bỏ qua.`)
        if (!refs.length) return
        setPurgeConfirm({ refs, label: `${refs.length} mục đã chọn`, key: PURGE_BULK_KEY })
    }, [items, selectedIds])

    const busy = restoringKey !== null || purgingKey !== null

    return (
        <div className="flex flex-col animate-fade-in" style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}>
            {/* title */}
            {!chromeless && (
                <div className="mb-4 flex items-center gap-3">
                    <div
                        className="flex items-center justify-center rounded-xl"
                        style={{ width: 40, height: 40, background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.22)' }}
                    >
                        <Trash2 className="h-5 w-5" style={{ color: '#FDA4AF' }} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="font-extrabold tracking-tight text-white" style={{ fontSize: 20 }}>
                            Thùng rác
                        </h1>
                        <p className="mt-px text-muted-foreground" style={{ fontSize: 12 }}>
                            Mục đã xóa gần đây — khôi phục về vị trí cũ bất cứ lúc nào.
                        </p>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60 shadow-xl shadow-black/40 backdrop-blur-xl">
                {/* header row: back + count + refresh + bulk restore */}
                <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                        {!chromeless && (
                            <a
                                href={teamHref}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                                <ChevronLeft size={15} /> {REVIEW_MODULE_LABEL}
                            </a>
                        )}
                        {data && (
                            <span className="text-[11px] text-muted-foreground">
                                {data.total} mục{data.total > items.length ? ` (đã tải ${items.length})` : ''}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setRefreshKey((k) => k + 1)}
                            title="Tải lại"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        {anySelected && isAdmin && (
                            <button
                                type="button"
                                onClick={purgeSelected}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                                style={{ background: 'rgba(244,63,94,0.14)', color: '#FDA4AF' }}
                            >
                                {purgingKey === PURGE_BULK_KEY ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Xóa vĩnh viễn ({selectedIds.size})
                            </button>
                        )}
                        {anySelected && (
                            <button
                                type="button"
                                onClick={restoreSelected}
                                disabled={busy}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                            >
                                {restoringKey === BULK_KEY ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                Khôi phục ({selectedIds.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* banner */}
                <div className="flex items-center gap-2 border-b border-white/5 bg-amber-500/[0.06] px-4 py-2 text-[11.5px] text-amber-200/90">
                    <AlertTriangle size={13} className="shrink-0" />
                    Các mục trong thùng rác sẽ tự động xóa vĩnh viễn sau 30 ngày kể từ khi xóa.
                </div>

                {/* select-all */}
                {restorable.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2">
                        <button
                            type="button"
                            onClick={toggleAll}
                            aria-label={anySelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                            className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors ${
                                allSelected
                                    ? 'border-violet-400 bg-violet-500 text-white'
                                    : 'border-white/40 bg-black/30 text-transparent hover:border-white/60'
                            }`}
                        >
                            <Check size={12} strokeWidth={3} />
                        </button>
                        <span className="text-[11.5px] text-muted-foreground">Chọn tất cả có thể khôi phục (đã tải)</span>
                    </div>
                )}

                {/* list */}
                <div className="min-h-[360px]">
                    {loading ? (
                        <div className="flex flex-col gap-1.5 p-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-14 animate-pulse rounded-lg border border-white/5 bg-white/[0.03]" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                                <AlertTriangle size={22} />
                            </div>
                            <p className="max-w-sm text-[13px] text-zinc-400">{error}</p>
                            <button
                                type="button"
                                onClick={() => setRefreshKey((k) => k + 1)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] text-zinc-200 transition-colors hover:bg-white/[0.12]"
                            >
                                <RefreshCw size={13} /> Thử lại
                            </button>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-muted-foreground">
                                <Trash2 size={26} />
                            </div>
                            <div>
                                <p className="text-[14px] font-medium text-zinc-200">Thùng rác trống</p>
                                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                                    Mục bạn xóa trong {REVIEW_MODULE_LABEL} sẽ xuất hiện ở đây và có thể khôi phục trong 30 ngày.
                                </p>
                            </div>
                            <a
                                href={teamHref}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-4 py-2 text-[12.5px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.12]"
                            >
                                <ChevronLeft size={14} /> Về {REVIEW_MODULE_LABEL}
                            </a>
                        </div>
                    ) : (
                        <>
                            <ul className="divide-y divide-white/[0.04]">
                                {items.map((it) => (
                                    <TrashRow
                                        key={it.id}
                                        item={it}
                                        checked={selectedIds.has(it.id)}
                                        onToggle={() => toggle(it.id)}
                                        restoring={restoringKey === it.id}
                                        purging={purgingKey === it.id}
                                        disabled={busy}
                                        isAdmin={isAdmin}
                                        onRestore={() => doRestore([{ type: it.type, id: it.id }], it.id)}
                                        onPurge={() => {
                                            // versions have no purge endpoint — see purgeSelected.
                                            if (it.type === 'version') return
                                            setPurgeConfirm({ refs: [{ type: it.type, id: it.id }], label: `"${it.name}"`, key: it.id })
                                        }}
                                    />
                                ))}
                            </ul>
                            {nextCursor && (
                                <div className="flex justify-center border-t border-white/5 py-3">
                                    <button
                                        type="button"
                                        onClick={loadMore}
                                        disabled={loadingMore}
                                        className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:opacity-60"
                                    >
                                        {loadingMore && <Loader2 size={13} className="animate-spin" />}
                                        Tải thêm
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* P6.2 Delete-forever confirm (FR-B13 [S], verbatim copy) */}
            {purgeConfirm && (
                <PurgeConfirmModal
                    label={purgeConfirm.label}
                    onCancel={() => setPurgeConfirm(null)}
                    onConfirm={() => void doPurge(purgeConfirm.refs, purgeConfirm.key)}
                />
            )}
        </div>
    )
}

function PurgeConfirmModal({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
            >
                <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(244,63,94,0.14)' }}>
                        <Trash2 className="h-5 w-5" style={{ color: '#FDA4AF' }} />
                    </div>
                    <h2 className="text-[15px] font-bold text-white">Xóa vĩnh viễn {label}?</h2>
                    <button onClick={onCancel} className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-white">
                        <X size={16} />
                    </button>
                </div>
                <p className="mb-4 text-[12.5px] leading-relaxed text-zinc-400">
                    Hành động này không thể hoàn tác. File gốc và mọi bình luận sẽ bị xóa.
                </p>
                <div className="flex justify-end gap-2">
                    <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] text-zinc-300 hover:bg-white/[0.06]">
                        Hủy
                    </button>
                    <button
                        onClick={onConfirm}
                        className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white"
                        style={{ background: '#E11D48' }}
                    >
                        Xóa vĩnh viễn
                    </button>
                </div>
            </div>
        </div>
    )
}

function TrashRow({
    item,
    checked,
    onToggle,
    onRestore,
    onPurge,
    restoring,
    purging,
    disabled,
    isAdmin,
}: {
    item: TrashItem
    checked: boolean
    onToggle: () => void
    onRestore: () => void
    onPurge: () => void
    restoring: boolean
    purging: boolean
    disabled: boolean
    isAdmin: boolean
}) {
    const isFolder = item.type === 'folder'
    // [audit 2026-07-27] 'version' rows are new here: a single version deleted out of a live stack
    // used to be invisible in this list (and un-restorable) despite the confirm dialog promising a
    // 30-day restore. It reads as one file, not a stack, so it shows its own size.
    const isVersion = item.type === 'version'
    const meta = isFolder
        ? `${item.meta.itemCount ?? 0} mục · ${bytesLabel(item.meta.sizeBytes ?? '0')}`
        : isVersion
          ? `Phiên bản · ${bytesLabel(item.meta.sizeBytes ?? '0')}`
          : `${item.meta.versionCount ?? 0} phiên bản`
    // [audit 2026-07-27 · MED] A trashed folder can still hold LIVE content — a later task upload
    // lands underneath it, or someone restored a child. The purge refuses those, so "Xóa vĩnh viễn"
    // would do nothing. Say it on the row instead of letting the admin find out by clicking.
    const liveInside = isFolder ? item.meta.liveDescendants ?? 0 : 0

    return (
        <li className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03] ${checked ? 'bg-violet-500/[0.06]' : ''}`}>
            <button
                type="button"
                disabled={!item.restorable}
                onClick={onToggle}
                aria-label={checked ? 'Bỏ chọn' : 'Chọn'}
                title={item.restorable ? undefined : 'Không thể khôi phục (thư mục gốc đã bị xóa vĩnh viễn)'}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    checked ? 'border-violet-400 bg-violet-500 text-white' : 'border-white/40 bg-black/30 text-transparent hover:border-white/60'
                }`}
            >
                <Check size={12} strokeWidth={3} />
            </button>

            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isFolder ? 'bg-violet-500/10 text-violet-300' : 'bg-white/[0.05] text-zinc-400'}`}>
                {isFolder ? <FolderIcon size={17} /> : <Film size={17} />}
            </div>

            <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-zinc-100" title={item.name}>
                    {item.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{meta}</span>
                    <span className="text-zinc-700">·</span>
                    <span>Xóa bởi {item.deletedBy?.name ?? 'hệ thống'}</span>
                    {liveInside > 0 && (
                        <>
                            <span className="text-zinc-700">·</span>
                            <span
                                className="text-amber-300/90"
                                title="Thư mục này vẫn chứa nội dung đang hoạt động, nên không thể xóa vĩnh viễn. Khôi phục thư mục để xử lý phần bên trong."
                            >
                                còn {liveInside} mục đang hoạt động bên trong
                            </span>
                        </>
                    )}
                </div>
            </div>

            <CountdownChip purgeAt={item.purgeAt} />

            <button
                type="button"
                disabled={!item.restorable || disabled}
                onClick={onRestore}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                title={item.restorable ? 'Khôi phục' : 'Không thể khôi phục'}
            >
                {restoring ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                <span className="hidden sm:inline">Khôi phục</span>
            </button>

            {isAdmin && (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onPurge}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg px-2 py-1.5 text-zinc-400 transition-colors hover:bg-red-500/[0.12] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Xóa vĩnh viễn"
                    aria-label="Xóa vĩnh viễn"
                >
                    {purging ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
            )}
        </li>
    )
}
