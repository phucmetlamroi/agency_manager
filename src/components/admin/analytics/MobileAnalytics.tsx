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
}

type MobileAnalyticsProps = {
    /** analyticsData từ page.tsx — mảng per-staff đã tính sẵn. */
    data: UserAnalytics[]
    workspaceId: string
}

// [BỎ HẠNG S/A/B/C/D 2026-07-31] Xoá ba hàm `fmtRate`, `rankTone`, `rateTone` — cả ba chỉ phục vụ
// việc hiển thị hạng và tỉ lệ lỗi. Bản di động nay bám đúng bản máy tính: chỉ còn số lỗi thô.

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
        // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ KPI `avgRate` (tỉ lệ lỗi trung bình).
        return { count, totalTasks, totalPenalty }
    }, [rows])

    // ── Danh sách: nhiều lỗi nhất lên đầu — mirror sort mặc định desktop (totalPenalty desc). ──
    const listRows = useMemo(
        () => [...rows].sort((a, b) => b.totalPenalty - a.totalPenalty),
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

    // ── Chart 2: nhiều lỗi nhất (top 12) ──
    // [BỎ HẠNG S/A/B/C/D 2026-07-31] Biểu đồ này trước vẽ theo `errorRate` (điểm phạt / task).
    // Nay vẽ theo `totalPenalty` — tổng số lỗi thô, cùng đại lượng với cột "Tổng Lỗi" bản máy tính.
    const errorChart = useMemo(
        () =>
            [...rows]
                .filter((r) => r.totalPenalty > 0)
                .sort((a, b) => b.totalPenalty - a.totalPenalty)
                .slice(0, 12)
                .map((r) => ({ name: r.name, value: r.totalPenalty })),
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
                            {/* [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ thẻ KPI "Tỷ lệ lỗi TB". */}
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
                                            tickFormatter={(v: number) => formatCompactCount(v)}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                                            content={<StaffTooltip unit="điểm lỗi" />}
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

                                    {/* [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ cụm huy hiệu hạng + tỉ lệ lỗi bên phải mỗi dòng.
                                        Số điểm lỗi vẫn còn, nằm ngay trên dòng phụ bên trái. */}

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
}: TooltipProps<ValueType, NameType> & { unit: string }) {
    // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ cờ `rate` — không còn biểu đồ nào vẽ theo tỉ lệ, cả hai
    // biểu đồ nay đều là số đếm (task hoàn tất / điểm lỗi) nên dùng chung một cách định dạng.
    if (!active || !payload || !payload.length) return null
    const p = payload[0].payload as { name: string; value: number }
    return (
        <div className="glass-3 rounded-xl border border-white/10 px-3 py-2 shadow-2xl">
            <p className="mb-0.5 max-w-[200px] truncate text-caption text-muted-foreground">{p.name}</p>
            <p className="font-mono text-body-sm font-bold tabular-nums text-foreground">
                {formatCompactCount(p.value)} {unit}
            </p>
        </div>
    )
}
