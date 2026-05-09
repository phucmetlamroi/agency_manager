"use client"

import { useId } from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { ArrowUp, ArrowDown } from "lucide-react"

interface Props {
    /** Total net salary this month (VND) */
    totalThisMonth: number
    /** Total net salary previous month (VND) — used for MoM % */
    totalLastMonth: number
    /** Daily totals this month — array of numbers (oldest → newest), at least 1 element */
    sparkline: number[]
    /** Currency formatter locale (default vi-VN) */
    locale?: string
    /** Currency suffix (default 'VND') */
    currency?: string
}

const NP = {
    surface: "#0A0A0A",
    border: "rgba(139,92,246,0.15)",
    accent: "#8B5CF6",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#71717A",
}

function pctChange(curr: number, prev: number): number | null {
    if (prev === 0) return curr > 0 ? 100 : null
    return Math.round(((curr - prev) / prev) * 100)
}

/**
 * Net Salary widget — shows total earnings this month + sparkline + MoM trend.
 *
 * Per Figma: 315x156, displays headline number + small trend pill + sparkline.
 */
export default function WidgetNetSalary({
    totalThisMonth,
    totalLastMonth,
    sparkline,
    locale = "vi-VN",
    currency = "VND",
}: Props) {
    const gradientId = useId()
    const pct = pctChange(totalThisMonth, totalLastMonth)
    const trendUp = (pct ?? 0) >= 0
    const TrendIcon = trendUp ? ArrowUp : ArrowDown

    const chartData = sparkline.length > 0
        ? sparkline.map((v, i) => ({ i, v }))
        : [{ i: 0, v: 0 }]

    return (
        <div
            className="relative overflow-hidden rounded-[20px] p-5 flex flex-col justify-between h-full"
            style={{
                background: NP.surface,
                border: `1px solid ${NP.border}`,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
            }}
        >
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 z-10 relative">
                <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: NP.textMuted }}>
                        Net Salary
                    </span>
                    <span
                        className="text-[24px] font-extrabold leading-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent"
                    >
                        {totalThisMonth.toLocaleString(locale)} <span className="text-[14px] font-semibold opacity-80">{currency}</span>
                    </span>
                </div>
                {pct !== null && (
                    <span
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{
                            background: trendUp ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                            color: trendUp ? "#34D399" : "#F87171",
                            border: `1px solid ${trendUp ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)"}`,
                        }}
                    >
                        <TrendIcon className="w-3 h-3" />
                        {trendUp ? "+" : ""}{pct}%
                    </span>
                )}
            </div>

            {/* Sparkline */}
            <div className="absolute inset-x-0 bottom-0 h-[60px] opacity-95 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="v"
                            stroke="#8B5CF6"
                            strokeWidth={1.8}
                            fill={`url(#${gradientId})`}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Footer label */}
            <span className="text-[11px] z-10 relative" style={{ color: NP.textMuted }}>
                vs last month
            </span>
        </div>
    )
}
