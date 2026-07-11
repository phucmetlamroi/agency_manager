'use client'

// [Mobile P4 / M7 — FR-E1, FR-E5, FR-E6, FR-H4, FR-I5] Danh sách khách hàng dạng card
// cho mobile (dispatcher ở page.tsx chọn cái này khi x-device-type=mobile; desktop giữ
// bảng 6 cột ClientList.tsx nguyên vẹn). Header + search realtime + sort + chip lọc vướng
// mắc + card list + "Tải thêm" + EmptyState. State search/sort/filter client-side.
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowDownUp, ChevronDown, Check, AlertTriangle, Users, Share2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import CreateClientButton from '@/components/crm/CreateClientButton'
import MobileClientCard, { computeClientMetrics, type ClientNode, type ClientMetrics } from './MobileClientCard'
import ClientSheet from './ClientSheet'
import SwipeableCard from '@/components/mobile/SwipeableCard'
import { EmptyState } from '@/components/ui/empty-state'
import { createClientShareLink } from '@/actions/share-link-actions'
import { formatCompactVNDWithUnit } from '@/lib/format-compact'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { updateClient } from '@/actions/crm-actions'
import { cn } from '@/lib/utils'

type SortKey = 'revenue' | 'name' | 'tasks'

const SORT_LABELS: Record<SortKey, string> = {
    revenue: 'Doanh thu ↓',
    name: 'Tên A–Z',
    tasks: 'Nhiều task nhất',
}

const PAGE_SIZE = 30

export default function MobileClientList({ clients, workspaceId }: { clients: ClientNode[]; workspaceId: string }) {
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [searchQuery, setSearchQuery] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('revenue')
    const [frictionFilter, setFrictionFilter] = useState(false)
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    // Sheet + edit dialog. `sheetOpen` is decoupled from `selectedClient` so the sheet
    // body stays mounted through vaul's ~300ms close animation (selectedClient lingers
    // until the next card tap replaces it) — else the sheet slides down empty.
    const [selectedClient, setSelectedClient] = useState<ClientNode | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [editingClient, setEditingClient] = useState<ClientNode | null>(null)
    const [editName, setEditName] = useState('')

    const openSheet = (client: ClientNode) => {
        setSelectedClient(client)
        setSheetOpen(true)
    }

    // Số liệu tính 1 lần / khách — dùng chung cho card + sort/filter + sheet.
    const metricsById = useMemo(() => {
        const m: Record<number, ClientMetrics> = {}
        for (const c of clients) m[c.id] = computeClientMetrics(c)
        return m
    }, [clients])

    const frictionCount = useMemo(
        () => clients.filter((c) => metricsById[c.id]?.hasFriction).length,
        [clients, metricsById],
    )

    // Money-first: tổng doanh thu (header) + max (chuẩn hoá bề rộng thanh trên mỗi card).
    const { maxRevenue, totalRevenue } = useMemo(() => {
        let max = 0
        let total = 0
        for (const c of clients) {
            const r = metricsById[c.id]?.revenueVND ?? 0
            total += r
            if (r > max) max = r
        }
        return { maxRevenue: max, totalRevenue: total }
    }, [clients, metricsById])

    // [design-handoff 2c] Quẹt hàng → "Chia sẻ": tạo link Portal khách + copy clipboard.
    const [portalPendingId, setPortalPendingId] = useState<number | null>(null)
    const handlePortal = async (client: ClientNode) => {
        if (portalPendingId !== null) return
        setPortalPendingId(client.id)
        try {
            const res = await createClientShareLink(client.id, workspaceId)
            if (!res.success) {
                toast.error(res.error || 'Không tạo được link Portal.')
                return
            }
            try {
                await navigator.clipboard.writeText(res.url)
                toast.success('Đã tạo link Portal — đã copy vào clipboard')
            } catch {
                toast.success('Đã tạo link Portal', { description: res.url })
            }
        } catch {
            toast.error('Không tạo được link Portal. Vui lòng thử lại.')
        } finally {
            setPortalPendingId(null)
        }
    }

    const processed = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        let list = clients
        if (q) {
            list = list.filter(
                (c) =>
                    c.name.toLowerCase().includes(q) ||
                    (c.subsidiaries ?? []).some((s) => s.name.toLowerCase().includes(q)),
            )
        }
        if (frictionFilter) list = list.filter((c) => metricsById[c.id]?.hasFriction)
        const sorted = [...list].sort((a, b) => {
            if (sortKey === 'name') return a.name.localeCompare(b.name, 'vi')
            if (sortKey === 'tasks') return metricsById[b.id].taskCount - metricsById[a.id].taskCount
            return metricsById[b.id].revenueVND - metricsById[a.id].revenueVND
        })
        return sorted
    }, [clients, metricsById, searchQuery, frictionFilter, sortKey])

    const visible = processed.slice(0, visibleCount)

    const resetPaging = () => setVisibleCount(PAGE_SIZE)

    const handleEdit = (client: ClientNode) => {
        setSheetOpen(false)
        setEditingClient(client)
        setEditName(client.name)
    }

    const handleUpdate = async () => {
        if (!editingClient) return
        if (!editName.trim()) {
            toast.error('Tên không được để trống')
            return
        }
        const res = await updateClient(editingClient.id, { name: editName }, workspaceId)
        if (res.success) {
            toast.success('Đã cập nhật tên khách hàng')
            setEditingClient(null)
            startTransition(() => router.refresh())
        } else {
            toast.error(res.error)
        }
    }

    // ── EmptyState theo ngữ cảnh (M7.4) ──
    const renderEmpty = () => {
        // First-use: 0 khách trong workspace.
        if (clients.length === 0) {
            return (
                <div className="pt-2">
                    <EmptyState
                        variant="first-use"
                        icon={Users}
                        title="Chưa có khách hàng nào"
                        description="Thêm khách đầu tiên để bắt đầu quản lý doanh thu."
                    />
                    <div className="mt-4 flex justify-center">
                        <CreateClientButton partners={clients as never} workspaceId={workspaceId} />
                    </div>
                </div>
            )
        }
        // Search 0 kết quả (ưu tiên trước filter).
        if (searchQuery.trim()) {
            return (
                <div className="pt-2">
                    <EmptyState
                        variant="no-results"
                        title={`Không tìm thấy khách khớp "${searchQuery.trim()}"`}
                        description="Thử một từ khóa khác."
                        cta={{ label: 'Xóa tìm kiếm', onClick: () => { setSearchQuery(''); resetPaging() } }}
                    />
                </div>
            )
        }
        // Lọc vướng mắc 0 kết quả.
        return (
            <div className="pt-2">
                <EmptyState
                    variant="no-results"
                    icon={AlertTriangle}
                    title="Không có khách nào đang vướng mắc"
                    cta={{ label: 'Bỏ lọc', onClick: () => { setFrictionFilter(false); resetPaging() } }}
                />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            {/* ── Header: title + count + "+ Thêm khách" (cùng hàng flex, min-w-0) ── */}
            <div className="flex items-center justify-between gap-3">
                <h1 className="min-w-0 truncate text-page font-bold text-foreground">
                    Khách hàng <span className="font-normal text-muted-foreground">({clients.length})</span>
                </h1>
                <div className="shrink-0">
                    <CreateClientButton partners={clients as never} workspaceId={workspaceId} />
                </div>
            </div>

            {/* ── Money-first: tổng doanh thu ── */}
            {totalRevenue > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2.5">
                    <Wallet className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="text-body-sm text-muted-foreground">Tổng doanh thu</span>
                    <span className="ml-auto whitespace-nowrap font-mono text-[15px] font-bold text-emerald-400">
                        {formatCompactVNDWithUnit(totalRevenue)}
                    </span>
                </div>
            )}

            {/* ── Search (h-12, ≥16px chặn iOS zoom) ── */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); resetPaging() }}
                    placeholder="Tìm khách hàng…"
                    className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 pl-10 pr-3 text-body text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/40"
                />
            </div>

            {/* ── Sort dropdown + chip lọc nhanh ── */}
            <div className="flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex h-11 items-center gap-1.5 rounded-lg glass-1 px-3 text-body-sm text-foreground transition-transform active:scale-[0.98]"
                        >
                            <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Sắp xếp: {SORT_LABELS[sortKey]}</span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="start"
                        className="z-popover min-w-[200px] rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 text-foreground shadow-2xl shadow-black/60 backdrop-blur-xl"
                    >
                        {(['revenue', 'tasks', 'name'] as SortKey[]).map((k) => (
                            <DropdownMenuItem
                                key={k}
                                onClick={() => setSortKey(k)}
                                className="cursor-pointer gap-2 rounded-lg py-2.5 text-body-sm"
                            >
                                <span>{SORT_LABELS[k]}</span>
                                {sortKey === k && <Check className="ml-auto h-4 w-4 text-primary-accent" />}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {frictionCount > 0 && (
                    <button
                        type="button"
                        onClick={() => { setFrictionFilter((v) => !v); resetPaging() }}
                        aria-pressed={frictionFilter}
                        className={cn(
                            'inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-body-sm transition-transform active:scale-[0.98]',
                            frictionFilter
                                ? 'border-warning/30 bg-warning/15 text-warning'
                                : 'border-white/8 bg-zinc-900/60 text-muted-foreground',
                        )}
                    >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Vướng mắc · {frictionCount}</span>
                    </button>
                )}
            </div>

            {/* ── Card list / EmptyState ── */}
            {visible.length === 0 ? (
                renderEmpty()
            ) : (
                <div className="space-y-3">
                    {visible.map((c) => (
                        <SwipeableCard
                            key={c.id}
                            rightAction={{
                                label: 'Chia sẻ',
                                icon: Share2,
                                color: 'bg-primary text-white',
                                onAction: () => handlePortal(c),
                            }}
                        >
                            <MobileClientCard client={c} metrics={metricsById[c.id]} maxRevenue={maxRevenue} onOpen={openSheet} />
                        </SwipeableCard>
                    ))}
                </div>
            )}

            {/* ── Tải thêm (khi còn >visibleCount) ── */}
            {processed.length > visibleCount && (
                <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="h-12 w-full rounded-xl border border-white/8 bg-zinc-900/60 text-body-sm font-medium text-foreground transition-transform active:scale-[0.98]"
                >
                    Tải thêm ({processed.length - visibleCount})
                </button>
            )}

            {/* ── Bottom sheet chi tiết ── */}
            <ClientSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                client={selectedClient}
                metrics={selectedClient ? metricsById[selectedClient.id] : null}
                workspaceId={workspaceId}
                onEdit={handleEdit}
                onPortal={handlePortal}
                portalPending={selectedClient !== null && portalPendingId === selectedClient.id}
            />

            {/* ── Dialog Sửa tên (giữ nguyên server action updateClient) ── */}
            <Dialog open={!!editingClient} onOpenChange={(o) => !o && setEditingClient(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Đổi tên khách hàng</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Tên mới</Label>
                            <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                placeholder="Nhập tên khách hàng…"
                                className="h-12 text-body"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="h-11" onClick={() => setEditingClient(null)}>
                            Hủy
                        </Button>
                        <Button className="h-11" onClick={handleUpdate}>Lưu thay đổi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
