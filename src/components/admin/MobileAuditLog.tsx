'use client'

// [Mobile P4.3 / M9 — FR-E7] Nhật ký hoạt động (mobile). Dispatcher ở page.tsx chọn cái
// này khi x-device-type=mobile; desktop giữ AuditLogViewer.tsx NGUYÊN VẸN (0 byte diff).
//
//  • Header "Nhật ký hoạt động" + nút "Lọc" (đếm bộ lọc đang bật: "Lọc · 1").
//  • Bộ lọc trong MobileSheet (4 field 1 cột: người thực hiện, loại sự kiện, từ/đến ngày)
//    → "Áp dụng" fetch trang 1 · "Xóa lọc" reset. Đóng sheet: X / scrim / kéo / Back
//    (useHistoryBackClose bên trong MobileSheet).
//  • Log gộp theo ngày (Hôm nay / Hôm qua / dd-MM), mỗi nhóm là card-group LogRow.
//  • "Tải thêm" gọi getWorkspaceAuditLogs trang kế + nối vào danh sách.
//  • EmptyState: first-use ("Chưa có hoạt động nào") + no-results (+ "Xóa lọc").
//
// State bộ lọc/phân trang giữ client-side (khớp AuditLogViewer, tránh churn router trên
// mobile) — spec cho phép khi URL params awkward (đây là sheet có nút "Áp dụng").
import { useCallback, useMemo, useState, useTransition } from 'react'
import { ScrollText, SlidersHorizontal, Loader2 } from 'lucide-react'
import { getWorkspaceAuditLogs } from '@/actions/audit-actions'
import type { AuditLogEntry } from '@/actions/audit-actions'
import { actionTypeLabel } from '@/lib/activity-log'
import { EmptyState } from '@/components/ui/empty-state'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import LogRow from './LogRow'

type Props = {
    workspaceId: string
    initialLogs: AuditLogEntry[]
    initialTotal: number
    initialPage: number
    initialPageSize: number
    initialTotalPages: number
    actionTypes: string[]
    actors: { id: string; name: string }[]
}

type Filters = { actor: string; event: string; from: string; to: string }
const EMPTY_FILTERS: Filters = { actor: '', event: '', from: '', to: '' }

/* ─── gộp theo ngày (Asia/Ho_Chi_Minh) ─── */

function vnDayKey(iso: string): string {
    // "YYYY-MM-DD" theo giờ VN — dùng làm khóa nhóm + so sánh hôm nay/hôm qua.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(iso))
}

function vnDayLabel(key: string, iso: string): string {
    const today = vnDayKey(new Date().toISOString())
    const yesterday = vnDayKey(new Date(Date.now() - 86_400_000).toISOString())
    if (key === today) return 'Hôm nay'
    if (key === yesterday) return 'Hôm qua'
    // dd-MM từ khóa "YYYY-MM-DD" (đã theo giờ VN nên cắt chuỗi là đủ, không lệch tz).
    const [, mm, dd] = key.split('-')
    return dd && mm ? `${dd}-${mm}` : iso.slice(0, 10)
}

type DayGroup = { key: string; label: string; items: AuditLogEntry[] }

function groupByDay(logs: AuditLogEntry[]): DayGroup[] {
    const groups: DayGroup[] = []
    const index = new Map<string, DayGroup>()
    for (const log of logs) {
        const key = vnDayKey(log.createdAt)
        let g = index.get(key)
        if (!g) {
            g = { key, label: vnDayLabel(key, log.createdAt), items: [] }
            index.set(key, g)
            groups.push(g)
        }
        g.items.push(log)
    }
    return groups
}

/* ─── component ─── */

export default function MobileAuditLog({
    workspaceId,
    initialLogs,
    initialTotal,
    initialPage,
    initialPageSize,
    initialTotalPages,
    actionTypes,
    actors,
}: Props) {
    const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs)
    const [total, setTotal] = useState(initialTotal)
    const [page, setPage] = useState(initialPage)
    const [totalPages, setTotalPages] = useState(initialTotalPages)

    // Bộ lọc đã áp dụng (đang phản chiếu trong danh sách) + bản nháp trong sheet.
    const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS)
    const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
    const [sheetOpen, setSheetOpen] = useState(false)

    const [isPending, startTransition] = useTransition()

    const activeCount = useMemo(
        () => (Object.values(applied) as string[]).filter(Boolean).length,
        [applied],
    )
    const hasFilters = activeCount > 0

    const toServerFilters = (f: Filters) => ({
        action: f.event || undefined,
        actorUserId: f.actor || undefined,
        dateFrom: f.from || undefined,
        dateTo: f.to || undefined,
    })

    // Fetch trang 1 với bộ lọc mới → thay toàn bộ danh sách.
    const applyFilters = useCallback(
        (f: Filters) => {
            startTransition(async () => {
                try {
                    const res = await getWorkspaceAuditLogs(
                        workspaceId,
                        toServerFilters(f),
                        1,
                        initialPageSize,
                    )
                    setLogs(res.logs)
                    setTotal(res.total)
                    setPage(res.page)
                    setTotalPages(res.totalPages)
                    setApplied(f)
                } catch {
                    // giữ dữ liệu hiện tại khi lỗi
                }
            })
        },
        [workspaceId, initialPageSize],
    )

    // "Tải thêm" — fetch trang kế + NỐI vào danh sách (giữ bộ lọc đang áp dụng).
    const loadMore = useCallback(() => {
        if (page >= totalPages) return
        startTransition(async () => {
            try {
                const next = page + 1
                const res = await getWorkspaceAuditLogs(
                    workspaceId,
                    toServerFilters(applied),
                    next,
                    initialPageSize,
                )
                setLogs((prev) => [...prev, ...res.logs])
                setTotal(res.total)
                setPage(res.page)
                setTotalPages(res.totalPages)
            } catch {
                // no-op
            }
        })
    }, [workspaceId, applied, page, totalPages, initialPageSize])

    const handleApply = () => {
        setSheetOpen(false)
        applyFilters(draft)
    }
    const handleClear = () => {
        setDraft(EMPTY_FILTERS)
        setSheetOpen(false)
        applyFilters(EMPTY_FILTERS)
    }
    const openSheet = () => {
        setDraft(applied) // mở sheet với trạng thái bộ lọc đang áp dụng
        setSheetOpen(true)
    }

    const groups = useMemo(() => groupByDay(logs), [logs])
    const canLoadMore = page < totalPages

    return (
        <div className="flex flex-col gap-3 pb-8">
            {/* ── Header: title + count + nút Lọc ── */}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="truncate text-page font-bold text-foreground">
                        Nhật ký hoạt động
                    </h1>
                    <p className="mt-0.5 text-caption text-muted-foreground">
                        {total} hoạt động
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openSheet}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl glass-1 px-3.5 text-body-sm font-medium text-foreground transition-transform active:scale-[0.98]"
                >
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    <span>{hasFilters ? `Lọc · ${activeCount}` : 'Lọc'}</span>
                    {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </button>
            </div>

            {/* ── Danh sách gộp theo ngày / EmptyState ── */}
            {logs.length === 0 ? (
                hasFilters ? (
                    <EmptyState
                        variant="no-results"
                        title="Không có hoạt động nào khớp bộ lọc"
                        description="Thử nới lỏng khoảng ngày hoặc đổi loại sự kiện."
                        cta={{ label: 'Xóa lọc', onClick: handleClear }}
                        className="mt-4"
                    />
                ) : (
                    <EmptyState
                        variant="first-use"
                        icon={ScrollText}
                        title="Chưa có hoạt động nào"
                        description="Mọi thao tác quan trọng trong workspace sẽ xuất hiện ở đây."
                        className="mt-4"
                    />
                )
            ) : (
                <div className="flex flex-col gap-4">
                    {groups.map((g) => (
                        <section key={g.key} className="flex flex-col gap-1.5">
                            <h2 className="px-1 text-caption font-medium uppercase tracking-wide text-muted-foreground">
                                {g.label}
                            </h2>
                            <div className="glass-1 rounded-xl divide-y divide-white/[0.06]">
                                {g.items.map((log) => (
                                    <LogRow key={log.id} log={log} workspaceId={workspaceId} />
                                ))}
                            </div>
                        </section>
                    ))}

                    {canLoadMore && (
                        <button
                            type="button"
                            onClick={loadMore}
                            disabled={isPending}
                            className="h-11 w-full rounded-xl border border-white/8 bg-zinc-900/60 text-body-sm font-medium text-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
                        >
                            {isPending ? 'Đang tải…' : `Tải thêm (${total - logs.length})`}
                        </button>
                    )}
                </div>
            )}

            {/* ── Sheet bộ lọc (4 field · 1 cột) ── */}
            <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Lọc hoạt động">
                <div className="flex flex-col gap-4 pb-2 pt-1">
                    {/* Người thực hiện */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-caption font-medium text-muted-foreground">
                            Người thực hiện
                        </label>
                        <select
                            value={draft.actor}
                            onChange={(e) => setDraft((d) => ({ ...d, actor: e.target.value }))}
                            className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 px-3 text-body text-foreground outline-none transition-colors focus:border-primary/40"
                        >
                            <option value="">Tất cả</option>
                            {actors.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Loại sự kiện */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-caption font-medium text-muted-foreground">
                            Loại sự kiện
                        </label>
                        <select
                            value={draft.event}
                            onChange={(e) => setDraft((d) => ({ ...d, event: e.target.value }))}
                            className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 px-3 text-body text-foreground outline-none transition-colors focus:border-primary/40"
                        >
                            <option value="">Tất cả</option>
                            {actionTypes.map((a) => (
                                <option key={a} value={a}>
                                    {actionTypeLabel(a)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Từ ngày */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-caption font-medium text-muted-foreground">
                            Từ ngày
                        </label>
                        <input
                            type="date"
                            value={draft.from}
                            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                            placeholder="Chọn ngày"
                            className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 px-3 text-body text-foreground outline-none transition-colors focus:border-primary/40"
                        />
                    </div>

                    {/* Đến ngày */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-caption font-medium text-muted-foreground">
                            Đến ngày
                        </label>
                        <input
                            type="date"
                            value={draft.to}
                            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                            placeholder="Chọn ngày"
                            className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 px-3 text-body text-foreground outline-none transition-colors focus:border-primary/40"
                        />
                    </div>

                    {/* Áp dụng / Xóa lọc */}
                    <div className="mt-1 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={handleApply}
                            className="h-12 w-full rounded-xl bg-primary text-body font-semibold text-white transition-transform active:scale-[0.98]"
                        >
                            Áp dụng
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="h-11 w-full rounded-xl text-body-sm font-medium text-muted-foreground transition-colors active:bg-white/5"
                        >
                            Xóa lọc
                        </button>
                    </div>
                </div>
            </MobileSheet>
        </div>
    )
}
