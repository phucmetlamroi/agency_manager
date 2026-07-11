'use client'

// [Mobile P4.6 / M12 — FR-E3, FR-E5, FR-H4] Phân tích hiệu suất bản MOBILE.
// Dispatcher ở analytics/page.tsx chọn component này khi x-device-type=mobile; nhánh
// desktop (AnalyticsTable + LivePresenceBoard) giữ NGUYÊN VẸN (0 byte diff).
//
// M12 Analytics trên mobile = CARD LIST (không phải bảng — đây là "quét & mở", không
// so cột) + KPI tổng + biểu đồ nén. View này chỉ HIỂN THỊ đúng dữ liệu getAnalyticsData
// đã tính; KHÔNG tính lại phân tích, KHÔNG chạm action. Trang đã gate ADMIN TRƯỚC nhánh
// mobile nên mirror ở đây không phải leak (HARD INVARIANT #1/#2). Dữ liệu là hiệu suất
// (task/lỗi/hạng) — KHÔNG có field doanh thu agency/jobPriceUSD (HARD INVARIANT #3).
//
// Chart: tái dùng recharts (đúng lib desktop dùng — KHÔNG thêm dep vẽ mới). legend off,
// trục vi-VN nén. Không có chuỗi thời gian trong analytics data → 2 chart xếp hạng theo
// nhân sự (task nhiều nhất / tỷ lệ lỗi cao nhất), chỉ VẼ từ số đã truyền, không tính lại.

import { useMemo } from 'react'
import Link from 'next/link'
import { BarChart3, ChevronRight } from 'lucide-react'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import KpiStatCard from '@/components/dashboard/KpiStatCard'
import { EmptyState } from '@/components/ui/empty-state'
import { getDisplayName } from '@/lib/display-name'
import { formatCompactCount } from '@/lib/format-compact'

// Mirror ĐÚNG shape getAnalyticsData trả về (giữ nội bộ — action không export type).
type UserAnalytics = {
    id: string
    username: string
    completedTasks: number
    totalPenalty: number
    errorRate: number
    rank: string
}

type MobileAnalyticsProps = {
    /** analyticsData từ page.tsx — mảng per-staff đã tính sẵn. */
    data: UserAnalytics[]
    workspaceId: string
}

/** vi-VN ratio ("0,84") — errorRate là điểm phạt / task; 2 chữ số như action tính. */
function fmtRate(value: number): string {
    const n = Number(value ?? 0)
    if (!isFinite(n)) return '0'
    return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

/** Tông màu theo hạng — thang chất lượng bằng TOKEN (không hardcode hue như desktop):
 *  S/A = success · B = primary-accent · C = warning · D = destructive · else = muted. */
function rankTone(rank: string): string {
    switch (rank) {
        case 'S':
        case 'A':
            return 'border-success/30 bg-success/10 text-success'
        case 'B':
            return 'border-primary/30 bg-primary/10 text-primary-accent'
        case 'C':
            return 'border-warning/30 bg-warning/10 text-warning'
        case 'D':
            return 'border-destructive/30 bg-destructive/10 text-destructive'
        default:
            return 'border-white/10 bg-white/5 text-muted-foreground'
    }
}

/** Màu tỷ lệ lỗi — mirror ngưỡng desktop (<0.5 tốt · >1.5 xấu · giữa là cảnh báo). */
function rateTone(rate: number): string {
    if (rate < 0.5) return 'text-success'
    if (rate > 1.5) return 'text-destructive'
    return 'text-warning'
}

export default function MobileAnalytics({ data, workspaceId }: MobileAnalyticsProps) {
    const staff = data ?? []

    // Dẫn xuất tên hiển thị 1 lần (cấm lộ handle g_… ở list/chart/tooltip — HARD INVARIANT #4).
    const rows = useMemo(
        () => staff.map((s) => ({ ...s, name: getDisplayName({ username: s.username }) })),
        [staff],
    )

    // ── KPI tổng (thuần tổng hợp cùng các số đã tính — KHÔNG bịa) ──
    const kpis = useMemo(() => {
        const count = rows.length
        const totalTasks = rows.reduce((sum, r) => sum + Number(r.completedTasks || 0), 0)
        const totalPenalty = rows.reduce((sum, r) => sum + Number(r.totalPenalty || 0), 0)
        const avgRate = count > 0 ? rows.reduce((sum, r) => sum + Number(r.errorRate || 0), 0) / count : 0
        return { count, totalTasks, totalPenalty, avgRate }
    }, [rows])

    // ── Danh sách: hạng nặng lỗi lên đầu (quét & mở) — mirror sort mặc định desktop (errorRate desc). ──
    const listRows = useMemo(
        () => [...rows].sort((a, b) => b.errorRate - a.errorRate),
        [rows],
    )

    // ── Chart 1: task hoàn tất nhiều nhất (top 12 để đọc được trên 375px) ──
    const tasksChart = useMemo(
        () =>
            [...rows]
                .filter((r) => r.completedTasks > 0)
                .sort((a, b) => b.completedTasks - a.completedTasks)
                .slice(0, 12)
                .map((r) => ({ name: r.name, value: r.completedTasks })),
        [rows],
    )

    // ── Chart 2: tỷ lệ lỗi cao nhất (top 12) — màu bar theo ngưỡng ──
    const errorChart = useMemo(
        () =>
            [...rows]
                .filter((r) => r.errorRate > 0)
                .sort((a, b) => b.errorRate - a.errorRate)
                .slice(0, 12)
                .map((r) => ({ name: r.name, value: r.errorRate })),
        [rows],
    )

    return (
        <div className="flex flex-col gap-4">
            {/* ── Header ── */}
            <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10">
                    <BarChart3 className="h-5 w-5 text-primary-accent" />
                </span>
                <h1 className="text-page font-bold text-foreground">Phân tích hiệu suất</h1>
            </div>

            {staff.length === 0 ? (
                <EmptyState
                    variant="first-use"
                    icon={BarChart3}
                    title="Chưa có dữ liệu thống kê"
                    description="Khi nhân sự hoàn tất task hoặc bị ghi lỗi, thống kê hiệu suất sẽ xuất hiện ở đây."
                />
            ) : (
                <>
                    {/* ── KPI tổng ── */}
                    <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-3">
                            <KpiStatCard label="Tổng nhân sự" value={formatCompactCount(kpis.count)} />
                            <KpiStatCard
                                label="Task hoàn tất"
                                value={formatCompactCount(kpis.totalTasks)}
                                context="Tổng cả nhóm"
                            />
                            <KpiStatCard
                                label="Điểm lỗi"
                                value={formatCompactCount(kpis.totalPenalty)}
                                context="Tổng điểm phạt"
                            />
                            <KpiStatCard
                                label="Tỷ lệ lỗi TB"
                                value={fmtRate(kpis.avgRate)}
                                context="Trung bình / nhân sự"
                            />
                        </div>
                    </div>

                    {/* ── Chart: task hoàn tất nhiều nhất ── */}
                    {tasksChart.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h2 className="text-title font-semibold text-foreground">Task hoàn tất nhiều nhất</h2>
                            <div className="glass-1 h-48 w-full rounded-xl p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={tasksChart} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                                        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                                        <XAxis dataKey="name" hide />
                                        <YAxis
                                            width={40}
                                            allowDecimals={false}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                            tickFormatter={(v: number) => formatCompactCount(v)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                                            content={<StaffTooltip unit="task" />}
                                        />
                                        <Bar
                                            dataKey="value"
                                            radius={[3, 3, 0, 0]}
                                            maxBarSize={28}
                                            fill="hsl(var(--primary-accent))"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    {/* ── Chart: tỷ lệ lỗi cao nhất ── */}
                    {errorChart.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h2 className="text-title font-semibold text-foreground">Tỷ lệ lỗi cao nhất</h2>
                            <div className="glass-1 h-48 w-full rounded-xl p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={errorChart} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                                        <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                                        <XAxis dataKey="name" hide />
                                        <YAxis
                                            width={40}
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                                            tickFormatter={(v: number) => fmtRate(v)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                                            content={<StaffTooltip unit="điểm lỗi/task" rate />}
                                        />
                                        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
                                            {errorChart.map((d, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={
                                                        d.value > 1.5
                                                            ? 'hsl(var(--destructive))'
                                                            : d.value < 0.5
                                                                ? 'hsl(var(--success))'
                                                                : 'hsl(var(--warning))'
                                                    }
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    {/* ── Card list nhân sự (quét & mở → trang chi tiết) ── */}
                    <section className="flex flex-col gap-2">
                        <h2 className="text-title font-semibold text-foreground">Nhân sự</h2>
                        <div className="glass-1 overflow-hidden rounded-xl">
                            {listRows.map((r, i) => (
                                <Link
                                    key={r.id}
                                    href={`/${workspaceId}/admin/analytics/staff/${r.id}`}
                                    className={`flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors active:bg-white/[0.04] ${
                                        i > 0 ? 'border-t border-white/[0.06]' : ''
                                    }`}
                                >
                                    <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                                        <AvatarImage src={`https://avatar.vercel.sh/${encodeURIComponent(r.name)}`} />
                                        <AvatarFallback className="bg-surface-2 text-caption text-muted-foreground">
                                            {r.name.trim().charAt(0).toUpperCase() || '?'}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-body-sm font-semibold text-foreground">{r.name}</p>
                                        <p className="mt-0.5 text-caption text-muted-foreground">
                                            <span className="tabular-nums">{formatCompactCount(r.completedTasks)}</span> task
                                            {r.totalPenalty > 0 && (
                                                <>
                                                    {' · '}
                                                    <span className="tabular-nums">{formatCompactCount(r.totalPenalty)}</span> điểm lỗi
                                                </>
                                            )}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span
                                            className={`inline-flex min-w-7 items-center justify-center rounded-md border px-1.5 py-0.5 text-caption font-bold ${rankTone(
                                                r.rank,
                                            )}`}
                                        >
                                            {r.rank}
                                        </span>
                                        <span className={`text-caption font-medium tabular-nums ${rateTone(r.errorRate)}`}>
                                            {fmtRate(r.errorRate)}
                                        </span>
                                    </div>

                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                </Link>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    )
}

/** Tooltip chart — tên nhân sự (đã qua getDisplayName) + giá trị. */
function StaffTooltip({
    active,
    payload,
    unit,
    rate = false,
}: TooltipProps<ValueType, NameType> & { unit: string; rate?: boolean }) {
    if (!active || !payload || !payload.length) return null
    const p = payload[0].payload as { name: string; value: number }
    return (
        <div className="glass-3 rounded-xl border border-white/10 px-3 py-2 shadow-2xl">
            <p className="mb-0.5 max-w-[200px] truncate text-caption text-muted-foreground">{p.name}</p>
            <p className="font-mono text-body-sm font-bold tabular-nums text-foreground">
                {rate ? fmtRate(p.value) : formatCompactCount(p.value)} {unit}
            </p>
        </div>
    )
}
