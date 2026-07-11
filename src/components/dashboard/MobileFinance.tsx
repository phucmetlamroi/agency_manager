'use client'

// [Mobile P4.5 / M12 Finance — FR-E3, FR-E5] Bảng Tài chính bản MOBILE.
// Dispatcher ở finance/page.tsx chọn component này khi x-device-type=mobile; nhánh
// desktop (<FinanceDashboardClient>) giữ NGUYÊN VẸN (0 byte diff).
//
// TIỀN LÀ TỐI THƯỢNG — đây là trang nhạy cảm nhất (doanh thu agency + jobPriceUSD).
// View này chỉ HIỂN THỊ đúng các con số desktop đã tính; KHÔNG tính lại tài chính,
// KHÔNG chạm computeWorkspaceFinance, KHÔNG đổi mapping transactions ở page.tsx.
// Consume ĐÚNG `data` mà page truyền cho <FinanceDashboardClient> (cùng props/values).
//
// Trang đã gate `canViewFinance` (profile OWNER/ADMIN) TRƯỚC nhánh mobile ở page.tsx,
// nên mirror doanh thu/lợi nhuận/jobPriceUSD ở đây KHÔNG phải leak — cùng cổng gate
// desktop (HARD INVARIANT #1/#2/#4). jobPriceUSD desktop cũng lộ qua toggle USD.
//
// Chart: tái dùng recharts (đúng lib desktop AdminRevenueChart dùng — KHÔNG thêm dep
// vẽ mới). Không có chuỗi thời gian trong finance data → chart vẽ Doanh thu THEO TỪNG
// giao dịch (chỉ dùng `revenueVND` đã truyền sẵn, không tính lại). Sparkline KPI:
// desktop KHÔNG có series nên KpiStatCard "Doanh thu" KHÔNG gắn sparkline (điều kiện đề bài).

import { useMemo, useState } from 'react'
import { Landmark, Receipt, CheckCircle2, CircleDashed } from 'lucide-react'
import {
    BarChart,
    Bar,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    type TooltipProps,
} from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import KpiStatCard from '@/components/dashboard/KpiStatCard'
import { ScrollTable, type ScrollColumn } from '@/components/ui/scroll-table'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCompactVND, formatCompactVNDWithUnit } from '@/lib/format-compact'

// Mirror ĐÚNG shape mà page.tsx truyền cho <FinanceDashboardClient> (không import type
// vì FinanceData không export — tránh chạm FinanceDashboardClient, HARD INVARIANT #1).
type FinanceTransaction = {
    id: string
    title: string
    status: string
    assignee: string
    revenueVND: number
    wageVND: number
    netProfitVND: number
    jobPriceUSD: number
    isCompleted: boolean
}

type MobileFinanceData = {
    totalRevenueVND: number
    totalWageVND: number
    netProfit: number
    profitMargin: number
    completedCount: number
    projectedRevenueVND: number
    projectedWageVND: number
    projectedNetProfit: number
    projectedMargin: number
    allTasksCount: number
    pendingCount: number
    exchangeRate: number
    transactions: FinanceTransaction[]
}

/** USD trực tiếp — mirror formatUSDDirect của FinanceDashboardClient (jobPriceUSD). */
function formatUSD(amount: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Number(amount || 0))
}

function TypeBadge({ completed, full = false }: { completed: boolean; full?: boolean }) {
    if (completed) {
        return (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-caption font-semibold text-success whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
                {full ? 'Đã hoàn tất' : 'Xong'}
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary-accent whitespace-nowrap">
            <CircleDashed className="h-3 w-3 shrink-0" />
            {full ? 'Đang chờ' : 'Chờ'}
        </span>
    )
}

export default function MobileFinance({ data }: { data: MobileFinanceData }) {
    // Tách selectedRow khỏi sheetOpen để body còn mounted suốt animation đóng vaul.
    const [selectedRow, setSelectedRow] = useState<FinanceTransaction | null>(null)
    const [sheetOpen, setSheetOpen] = useState(false)

    const transactions = data.transactions ?? []

    // Dữ liệu chart = Doanh thu theo từng giao dịch (revenueVND đã truyền sẵn — KHÔNG
    // tính lại). Đảo thứ tự (page trả updatedAt desc) → cũ→mới đọc trái→phải như dòng
    // thời gian. Chỉ để VẼ; không đổi bất kỳ con số nào.
    const chartData = useMemo(
        () =>
            [...transactions].reverse().map((t, i) => ({
                i,
                revenue: t.revenueVND,
                title: t.title,
                completed: t.isCompleted,
            })),
        [transactions],
    )

    const openRow = (row: FinanceTransaction) => {
        setSelectedRow(row)
        setSheetOpen(true)
    }

    // Cột bảng — mirror ĐÚNG nhật ký giao dịch (team) của desktop bằng các field CÓ THẬT
    // trong transaction (title/assignee/revenue/wage/netProfit/status). Không có field
    // Ngày/Khách trong dataset → không bịa. Cột đầu (Hạng mục) ghim làm mỏ neo; cột cuối
    // (Loại) bị cắt nửa ở mép phải = tín hiệu Pattern-4 còn cuộn (FR-E3.4).
    const columns: ScrollColumn<FinanceTransaction>[] = [
        {
            key: 'title',
            header: 'Hạng mục',
            render: (t) => (
                <span
                    className={`block max-w-[160px] truncate font-medium ${
                        t.isCompleted ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                >
                    {t.title}
                </span>
            ),
        },
        {
            key: 'assignee',
            header: 'Người làm',
            render: (t) => (
                <span className="block max-w-[112px] truncate text-muted-foreground">{t.assignee}</span>
            ),
        },
        {
            key: 'revenue',
            header: 'Doanh thu',
            numeric: true,
            render: (t) => (t.revenueVND ? formatCompactVNDWithUnit(t.revenueVND) : null),
        },
        {
            key: 'wage',
            header: 'Thù lao',
            numeric: true,
            render: (t) =>
                t.wageVND ? (
                    <span className="text-destructive">{formatCompactVNDWithUnit(t.wageVND)}</span>
                ) : null,
        },
        {
            key: 'net',
            header: 'Lợi nhuận',
            numeric: true,
            render: (t) =>
                t.netProfitVND ? (
                    <span className={t.netProfitVND >= 0 ? 'font-semibold text-success' : 'font-semibold text-destructive'}>
                        {formatCompactVNDWithUnit(t.netProfitVND)}
                    </span>
                ) : null,
        },
        {
            key: 'type',
            header: 'Loại',
            align: 'left',
            render: (t) => <TypeBadge completed={t.isCompleted} />,
        },
    ]

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header ── */}
            <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-success/20 bg-success/10">
                    <Landmark className="h-5 w-5 text-success" />
                </span>
                <h1 className="text-page font-bold text-foreground">Tài chính</h1>
            </div>

            {/* ── Summary (mirror hàng "THỰC TẾ — ĐÃ HOÀN THÀNH" của desktop) ── */}
            <div className="flex flex-col gap-3">
                <KpiStatCard
                    label="Doanh thu"
                    value={formatCompactVNDWithUnit(data.totalRevenueVND)}
                    context={`Từ ${data.completedCount} task hoàn tất · dự kiến ${formatCompactVNDWithUnit(data.projectedRevenueVND)}`}
                    className="w-full"
                />
                <div className="grid grid-cols-2 gap-3">
                    <KpiStatCard
                        label="Chi phí"
                        value={formatCompactVNDWithUnit(data.totalWageVND)}
                        context="Thù lao đã trả"
                    />
                    <KpiStatCard
                        label="Lợi nhuận"
                        value={formatCompactVNDWithUnit(data.netProfit)}
                        context={`Biên LN ${data.profitMargin.toFixed(1)}%`}
                    />
                </div>
            </div>

            {/* ── Biểu đồ doanh thu theo giao dịch ── */}
            {chartData.length > 0 && (
                <section className="flex flex-col gap-2">
                    <h2 className="text-title font-semibold text-foreground">Doanh thu theo giao dịch</h2>
                    <div className="glass-1 h-56 w-full rounded-xl p-3">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                                <CartesianGrid
                                    strokeDasharray="4 4"
                                    stroke="hsl(var(--border))"
                                    vertical={false}
                                />
                                <XAxis dataKey="i" hide />
                                <YAxis
                                    width={48}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                    tickFormatter={(v: number) => formatCompactVND(v)}
                                />
                                <Tooltip
                                    cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                                    content={<RevenueTooltip />}
                                />
                                <Bar dataKey="revenue" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                    {chartData.map((d) => (
                                        <Cell
                                            key={d.i}
                                            fill={
                                                d.completed
                                                    ? 'hsl(var(--primary-accent))'
                                                    : 'hsl(var(--muted-foreground) / 0.35)'
                                            }
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            )}

            {/* ── Giao dịch ── */}
            <section className="flex flex-col gap-2">
                <h2 className="text-title font-semibold text-foreground">Giao dịch</h2>
                {transactions.length === 0 ? (
                    <EmptyState
                        variant="first-use"
                        icon={Receipt}
                        title="Chưa có giao dịch nào"
                        description="Khi có task phát sinh doanh thu hoặc chi phí, giao dịch sẽ xuất hiện ở đây."
                    />
                ) : (
                    <ScrollTable
                        columns={columns}
                        rows={transactions}
                        rowKey={(t) => t.id}
                        onRowClick={openRow}
                    />
                )}
            </section>

            {/* ── Sheet chi tiết 1 giao dịch (đọc không cần cuộn ngang) ── */}
            <MobileSheet open={sheetOpen} onOpenChange={setSheetOpen} title={selectedRow?.title}>
                {selectedRow && (
                    <div className="flex flex-col gap-1 pb-2">
                        {/* Loại nổi bật đầu sheet */}
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-body-sm text-muted-foreground">Loại</span>
                            <TypeBadge completed={selectedRow.isCompleted} full />
                        </div>

                        <DetailRow label="Trạng thái" value={selectedRow.status || '—'} />
                        <DetailRow label="Người làm" value={selectedRow.assignee || '—'} mono={false} />
                        <DetailRow
                            label="Doanh thu"
                            value={selectedRow.revenueVND ? formatCompactVNDWithUnit(selectedRow.revenueVND) : '—'}
                        />
                        <DetailRow
                            label="Giá job (USD)"
                            value={selectedRow.jobPriceUSD ? formatUSD(selectedRow.jobPriceUSD) : '—'}
                        />
                        <DetailRow
                            label="Thù lao"
                            value={selectedRow.wageVND ? formatCompactVNDWithUnit(selectedRow.wageVND) : '—'}
                        />

                        {/* Lợi nhuận ròng — hero */}
                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                            <span className="text-body-sm font-semibold text-muted-foreground">Lợi nhuận ròng</span>
                            <span
                                className={`font-mono text-title font-extrabold tabular-nums ${
                                    selectedRow.netProfitVND >= 0 ? 'text-success' : 'text-destructive'
                                }`}
                            >
                                {formatCompactVNDWithUnit(selectedRow.netProfitVND)}
                            </span>
                        </div>
                    </div>
                )}
            </MobileSheet>
        </div>
    )
}

/** Tooltip chart — tên hạng mục + doanh thu (vi-VN đầy đủ, không tính lại). */
function RevenueTooltip({ active, payload }: TooltipProps<ValueType, NameType>) {
    if (!active || !payload || !payload.length) return null
    const p = payload[0].payload as { title: string; revenue: number }
    return (
        <div className="glass-3 rounded-xl border border-white/10 px-3 py-2 shadow-2xl">
            <p className="mb-0.5 max-w-[200px] truncate text-caption text-muted-foreground">{p.title}</p>
            <p className="font-mono text-body-sm font-bold tabular-nums text-foreground">
                {Math.round(p.revenue).toLocaleString('vi-VN')} ₫
            </p>
        </div>
    )
}

/** Hàng label/value 1 cột trong sheet — số dùng font-mono tabular-nums. */
function DetailRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
    const isDash = value === '—'
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="shrink-0 text-body-sm text-muted-foreground">{label}</span>
            <span
                className={[
                    mono ? 'font-mono tabular-nums' : '',
                    'truncate text-body-sm',
                    isDash ? 'text-zinc-500' : 'font-medium text-foreground',
                ].join(' ')}
            >
                {value}
            </span>
        </div>
    )
}
