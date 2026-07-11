'use client'

// [Mobile P4 / M7.2 — FR-E1.1] Card khách hàng 3 dòng cho danh sách CRM mobile.
// Thay bảng 6 cột (desktop giữ nguyên qua dispatcher). Số liệu (doanh thu / task /
// vướng mắc / trạng thái) tính bằng computeClientMetrics — MIRROR ĐÚNG cách
// ClientList.tsx tổng hợp: doanh thu = tổng `jobPriceUSD` (đúng như desktop
// `computeRevenue`), task riêng + task brand con. KHÔNG lộ dữ liệu mới: /admin/crm
// là trang admin/finance-gated, desktop đã hiển thị chính con số này (getClients trả
// cùng payload). M7/DoD: desktop hiện "$107.500.000" (tiền tố "$" là lỗi f_0078) →
// mobile nén thành "107,5 Tr ₫" — CÙNG con số, chỉ đổi định dạng (nén + ký hiệu ₫).
import { AlertTriangle } from 'lucide-react'
import { formatCompactVNDWithUnit } from '@/lib/format-compact'
import { cn } from '@/lib/utils'

/** Task như serializeDecimal trả về (Decimal → number). */
export type ClientTask = {
    id: string | number
    title: string
    status: string
    /** Lương editor (VND) — KHÔNG dùng cho "Doanh thu khách". */
    value?: number
    /** Doanh thu khách (nguồn cho "Doanh thu") — mirror desktop computeRevenue. */
    jobPriceUSD?: number
}

export type ClientNode = {
    id: number
    name: string
    parentId?: number | null
    subsidiaries?: ClientNode[]
    tasks?: ClientTask[]
}

export type ClientStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE'

export type ClientMetrics = {
    taskCount: number
    /** Số task đang 'Đang thực hiện' (hiển thị "(N đang chạy)" trong sheet). */
    doingCount: number
    /** Doanh thu khách = tổng jobPriceUSD (task riêng + brand con) — như desktop computeRevenue. Hiển thị nén "Tr ₫". */
    revenueVND: number
    /** % task chưa 'Hoàn tất' — mirror ClientList.computeFriction. */
    friction: number
    /** Số task chưa 'Hoàn tất' (tử số của friction). */
    incompleteCount: number
    status: ClientStatus
    /** Vướng mắc cao → hiện dòng 3 + đếm vào chip. Ngưỡng ĐỎ (>30%) như FrictionCell desktop. */
    hasFriction: boolean
}

const STATUS_META: Record<ClientStatus, { label: string; badge: string; dot: string }> = {
    // Nhãn + hue MIRROR StatusPill của ClientList.tsx (emerald / amber / zinc), diễn đạt
    // qua token ngữ nghĩa success/warning + muted (không màu trần).
    ACTIVE: { label: 'Đang hoạt động', badge: 'bg-success/10 text-success border-success/25', dot: 'bg-success' },
    PENDING: { label: 'Chờ xử lý', badge: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
    INACTIVE: { label: 'Ngừng', badge: 'bg-white/5 text-muted-foreground border-white/10', dot: 'bg-zinc-500' },
}

/**
 * SINGLE source of truth cho card + sort/filter của list + sheet. Tổng hợp task
 * (riêng + brand con) GIỐNG HỆT ClientItem trong ClientList.tsx — kể cả doanh thu
 * (tổng jobPriceUSD, đúng như desktop computeRevenue) → mobile khớp số với desktop.
 */
export function computeClientMetrics(client: ClientNode): ClientMetrics {
    const ownTasks = client.tasks ?? []
    const subTasks = (client.subsidiaries ?? []).flatMap((s) => s.tasks ?? [])
    const allTasks = [...ownTasks, ...subTasks]
    const taskCount = allTasks.length
    const incompleteCount = allTasks.filter((t) => t.status !== 'Hoàn tất').length
    const doingCount = allTasks.filter((t) => t.status === 'Đang thực hiện').length
    // Doanh thu khách = tổng jobPriceUSD (mirror desktop computeRevenue, line 68). /admin/crm
    // là admin-gated + desktop đã render số này → không lộ dữ liệu mới. Hiển thị nén "Tr ₫".
    const revenueVND = allTasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD) || 0), 0)
    const friction = taskCount === 0 ? 0 : Math.round((incompleteCount / taskCount) * 100)
    // getClientStatus: 0 task → INACTIVE; có task chưa xong → ACTIVE; else PENDING.
    const status: ClientStatus = taskCount === 0 ? 'INACTIVE' : incompleteCount > 0 ? 'ACTIVE' : 'PENDING'
    return { taskCount, doingCount, revenueVND, friction, incompleteCount, status, hasFriction: friction > 30 }
}

/** Badge trạng thái cấp-khách (3 trạng thái) — dùng ở card + sheet. */
export function ClientStatusBadge({ status, className }: { status: ClientStatus; className?: string }) {
    const meta = STATUS_META[status]
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-semibold',
                meta.badge,
                className,
            )}
        >
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
            {meta.label}
        </span>
    )
}

export default function MobileClientCard({
    client,
    metrics,
    onOpen,
}: {
    client: ClientNode
    metrics: ClientMetrics
    onOpen: (client: ClientNode) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onOpen(client)}
            className="flex w-full flex-col gap-1 rounded-xl border border-white/5 bg-zinc-900/90 p-3 text-left transition-transform active:scale-[0.98]"
        >
            {/* Dòng 1: tên (truncate) + StatusBadge */}
            <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{client.name}</span>
                <ClientStatusBadge status={metrics.status} className="shrink-0" />
            </div>

            {/* Dòng 2: doanh thu compact (VND) · số task */}
            <div className="text-body-sm text-muted-foreground">
                {formatCompactVNDWithUnit(metrics.revenueVND)} · {metrics.taskCount} task
            </div>

            {/* Dòng 3: vướng mắc (chỉ khi friction cao) */}
            {metrics.hasFriction && (
                <div className="flex items-start gap-1.5 text-body-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words line-clamp-2">
                        {metrics.incompleteCount}/{metrics.taskCount} task chưa hoàn tất · {metrics.friction}%
                    </span>
                </div>
            )}
        </button>
    )
}
