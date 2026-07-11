'use client'

// [Mobile P4.4 / M12 — FR-E3, FR-E5, FR-E6, FR-H4] Bảng lương bản MOBILE.
// Dispatcher ở payroll/page.tsx chọn component này khi x-device-type=mobile; nhánh
// desktop (PayrollKpiStrip + PayrollCard) giữ NGUYÊN VẸN.
//
// TIỀN LÀ TỐI THƯỢNG — view này chỉ HIỂN THỊ đúng các con số desktop đã tính:
//   • wage (Lương)   = Σ value của task "Hoàn tất"            (= taskIncome của PayrollCard)
//   • bonus (Thưởng) = bonuses[0].bonusAmount                 (= bonusAmount của PayrollCard)
//   • net (Thực nhận)= wage + bonus                            (= totalIncome của PayrollCard)
//   • pending (Dự kiến) = Σ value của task đang xử lý          (= pendingIncome)
//   • isPaid         = payrolls[0].status === 'PAID'
// KHÔNG tính lại lương, KHÔNG đổi chữ ký action. Trang đã gate ADMIN nên mirror
// KHÔNG phải leak (HARD INVARIANT #2/#3). "Phạt" không có field trong dataset payroll
// (Payroll/MonthlyBonus không có cột penalty; Task.isPenalized là boolean desktop
// không hề render) → luôn hiển thị "—".

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, CircleDashed, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import KpiStatCard from '@/components/dashboard/KpiStatCard'
import { ScrollTable, type ScrollColumn } from '@/components/ui/scroll-table'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { getDisplayName } from '@/lib/display-name'
import { formatCompactVNDWithUnit, formatCompactCount } from '@/lib/format-compact'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { confirmPayment } from '@/actions/payroll-actions'
import type { PayrollTotals } from '@/components/admin/PayrollKpiStrip'

type MobilePayrollProps = {
    /** serializedUsers từ page.tsx (Decimal → number đã serialize). */
    users: any[]
    workspaceId: string
    /** Kỳ lương suy từ workspace.name (payrollCycle) — cùng nguồn desktop dùng. */
    currentMonth: number
    currentYear: number
    /** Tên workspace (vd "Tháng 6/2026") cho chip kỳ lương tĩnh. */
    workspaceName: string | null
    /** KPI tổng đã tính sẵn ở page.tsx — consume để khớp desktop từng byte. */
    totals: PayrollTotals
}

/** 1 hàng bảng lương — dẫn xuất từ user, KHÔNG tính lại (mirror PayrollCard). */
type PayrollRow = {
    id: string
    user: { displayName?: string | null; nickname?: string | null; username?: string | null }
    taskCount: number
    pendingCount: number
    wage: number
    bonus: number
    penalty: number
    net: number
    pending: number
    isPaid: boolean
}

function toNum(v: unknown): number {
    const n = Number(v ?? 0)
    return isFinite(n) ? n : 0
}

function PaymentBadge({ paid, full = false }: { paid: boolean; full?: boolean }) {
    if (paid) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-caption font-semibold text-success whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {full ? 'Đã thanh toán' : 'Đã trả'}
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-caption font-semibold text-muted-foreground whitespace-nowrap">
            <CircleDashed className="h-3 w-3 shrink-0" />
            {full ? 'Chờ thanh toán' : 'Chờ'}
        </span>
    )
}

export default function MobilePayroll({
    users,
    workspaceId,
    currentMonth,
    currentYear,
    workspaceName,
    totals,
}: MobilePayrollProps) {
    const router = useRouter()
    const [, startTransition] = useTransition()

    // Sheet chi tiết — tách `selectedRow` khỏi `sheetOpen` để body còn mounted suốt
    // animation đóng của vaul (~300ms), tránh sheet trượt xuống rỗng.
    const [selectedRow, setSelectedRow] = useState<PayrollRow | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)

    // Dẫn xuất hàng — mirror ĐÚNG công thức PayrollCard, không tính lại lương.
    const rows = useMemo<PayrollRow[]>(() => {
        return (users ?? []).map((u: any) => {
            const tasks: any[] = u.tasks ?? []
            const completed = tasks.filter((t) => t.status === SALARY_COMPLETED_STATUS)
            const pendingTasks = tasks.filter((t) => SALARY_PENDING_STATUSES.includes(t.status))
            const wage = completed.reduce((s, t) => s + toNum(t.value), 0)
            const pending = pendingTasks.reduce((s, t) => s + toNum(t.value), 0)
            const bonus = toNum(u.bonuses?.[0]?.bonusAmount)
            return {
                id: u.id,
                user: { displayName: u.displayName, nickname: u.nickname, username: u.username },
                taskCount: completed.length,
                pendingCount: pendingTasks.length,
                wage,
                bonus,
                penalty: 0, // không có field penalty trong dataset payroll → "—"
                net: wage + bonus,
                pending,
                isPaid: u.payrolls?.[0]?.status === 'PAID',
            }
        })
    }, [users])

    // Tổng "Đã / Chờ thanh toán" = phân hoạch net theo trạng thái. Thuần tổng hợp cùng
    // các con số desktop đã render; paid + chờ ≡ totals.net (HARD INVARIANT #2).
    const { paidTotal, unpaidTotal } = useMemo(() => {
        let paid = 0
        let unpaid = 0
        for (const r of rows) {
            if (r.isPaid) paid += r.net
            else unpaid += r.net
        }
        return { paidTotal: paid, unpaidTotal: unpaid }
    }, [rows])

    const periodLabel = workspaceName?.trim() || `Kỳ ${currentMonth}/${currentYear}`

    const openRow = (row: PayrollRow) => {
        setSelectedRow(row)
        setSheetOpen(true)
    }

    async function handleMarkPaid(row: PayrollRow) {
        setBusyId(row.id)
        try {
            // Payload TRÙNG KHỚP PaymentModal.handleConfirm — action tự resolve cycle
            // server-side từ workspace.name (bỏ qua month/year client). Không optimistic.
            const res = await confirmPayment(
                {
                    userId: row.id,
                    month: currentMonth,
                    year: currentYear,
                    totalAmount: row.net,
                    baseSalary: row.wage,
                    bonus: row.bonus,
                },
                workspaceId,
            )
            if (res && (res as any).success) {
                toast.success('Đã đánh dấu đã thanh toán.')
                setSheetOpen(false)
                startTransition(() => router.refresh())
            } else {
                toast.error((res as any)?.error || 'Không thể đánh dấu thanh toán. Thử lại.')
            }
        } catch {
            toast.error('Không thể đánh dấu thanh toán. Thử lại.')
        } finally {
            setBusyId(null)
        }
    }

    const columns: ScrollColumn<PayrollRow>[] = [
        {
            key: 'name',
            header: 'Nhân viên',
            render: (r) => (
                <span className="block max-w-[112px] truncate font-medium text-foreground">
                    {getDisplayName(r.user)}
                </span>
            ),
        },
        { key: 'task', header: 'Task', numeric: true, render: (r) => (r.taskCount > 0 ? formatCompactCount(r.taskCount) : null) },
        { key: 'wage', header: 'Lương', numeric: true, render: (r) => (r.wage > 0 ? formatCompactVNDWithUnit(r.wage) : null) },
        { key: 'bonus', header: 'Thưởng', numeric: true, render: (r) => (r.bonus > 0 ? formatCompactVNDWithUnit(r.bonus) : null) },
        { key: 'penalty', header: 'Phạt', numeric: true, render: (r) => (r.penalty > 0 ? formatCompactVNDWithUnit(r.penalty) : null) },
        {
            key: 'net',
            header: 'Thực nhận',
            numeric: true,
            render: (r) => (r.net > 0 ? <span className="font-semibold text-foreground">{formatCompactVNDWithUnit(r.net)}</span> : null),
        },
        {
            key: 'status',
            header: 'Trạng thái',
            align: 'left',
            render: (r) => <PaymentBadge paid={r.isPaid} />,
        },
    ]

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header + chip kỳ lương (tĩnh) ── */}
            <div className="flex flex-col gap-2">
                <h1 className="text-page font-bold text-foreground">Bảng lương</h1>
                {/* Kỳ lương do workspace quyết định (không có bộ chuyển kỳ trên desktop) →
                    chip TĨNH h-11, không tap. Đổi kỳ = đổi workspace. */}
                <div className="inline-flex h-11 w-fit items-center gap-2 rounded-xl border border-white/8 bg-surface-1/60 px-3 text-body-sm font-medium text-foreground">
                    <CalendarDays className="h-4 w-4 shrink-0 text-primary-accent" />
                    <span className="truncate">{periodLabel}</span>
                </div>
            </div>

            {/* ── Summary (TRƯỚC bảng) ── */}
            <div className="flex flex-col gap-3">
                <KpiStatCard
                    label="Tổng chi kỳ này"
                    value={formatCompactVNDWithUnit(totals.net)}
                    context="Đã gồm thưởng kỳ này"
                    className="w-full"
                />
                <div className="grid grid-cols-2 gap-3">
                    <KpiStatCard label="Đã thanh toán" value={formatCompactVNDWithUnit(paidTotal)} />
                    <KpiStatCard label="Chờ thanh toán" value={formatCompactVNDWithUnit(unpaidTotal)} />
                </div>
            </div>

            {/* ── Chi tiết theo nhân viên ── */}
            <section className="flex flex-col gap-2">
                <h2 className="text-title font-semibold text-foreground">Chi tiết theo nhân viên</h2>
                {rows.length === 0 ? (
                    <EmptyState
                        variant="first-use"
                        icon={Wallet}
                        title="Chưa có dữ liệu lương kỳ này"
                        description="Khi có task hoàn tất hoặc thưởng, nhân sự sẽ xuất hiện ở đây."
                    />
                ) : (
                    <ScrollTable
                        columns={columns}
                        rows={rows}
                        rowKey={(r) => r.id}
                        onRowClick={openRow}
                    />
                )}
            </section>

            {/* ── Sheet chi tiết 1 nhân viên (đọc không cần cuộn ngang) ── */}
            <MobileSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                title={selectedRow ? getDisplayName(selectedRow.user) : undefined}
            >
                {selectedRow && (
                    <div className="flex flex-col gap-1 pb-2">
                        {/* Trạng thái nổi bật đầu sheet */}
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-body-sm text-muted-foreground">Trạng thái</span>
                            <PaymentBadge paid={selectedRow.isPaid} full />
                        </div>

                        <DetailRow label="Task hoàn tất" value={selectedRow.taskCount > 0 ? formatCompactCount(selectedRow.taskCount) : '—'} />
                        <DetailRow label="Lương" value={selectedRow.wage > 0 ? formatCompactVNDWithUnit(selectedRow.wage) : '—'} />
                        <DetailRow label="Thưởng" value={selectedRow.bonus > 0 ? formatCompactVNDWithUnit(selectedRow.bonus) : '—'} />
                        <DetailRow label="Phạt" value={selectedRow.penalty > 0 ? formatCompactVNDWithUnit(selectedRow.penalty) : '—'} />
                        <DetailRow label="Dự kiến" value={selectedRow.pending > 0 ? formatCompactVNDWithUnit(selectedRow.pending) : '—'} />

                        {/* Thực nhận — hero */}
                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                            <span className="text-body-sm font-semibold text-muted-foreground">Thực nhận</span>
                            <span className="font-mono text-title font-extrabold tabular-nums text-foreground">
                                {formatCompactVNDWithUnit(selectedRow.net)}
                            </span>
                        </div>

                        {/* Mark-paid — gọi action HIỆN CÓ, non-optimistic */}
                        <div className="mt-3">
                            {selectedRow.isPaid ? (
                                <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-success/25 bg-success/10 text-body-sm font-semibold text-success">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Đã thanh toán
                                </div>
                            ) : (
                                <Button
                                    className="h-12 w-full gap-2 font-bold"
                                    disabled={busyId === selectedRow.id}
                                    onClick={() => handleMarkPaid(selectedRow)}
                                >
                                    <Wallet className="h-4 w-4" />
                                    {busyId === selectedRow.id ? 'Đang xử lý…' : 'Đánh dấu đã thanh toán'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </MobileSheet>
        </div>
    )
}

/** Hàng label/value 1 cột trong sheet — số dùng font-mono tabular-nums. */
function DetailRow({ label, value }: { label: string; value: string }) {
    const isDash = value === '—'
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-body-sm text-muted-foreground">{label}</span>
            <span
                className={
                    isDash
                        ? 'font-mono tabular-nums text-body-sm text-zinc-500'
                        : 'font-mono tabular-nums text-body-sm font-medium text-foreground'
                }
            >
                {value}
            </span>
        </div>
    )
}
