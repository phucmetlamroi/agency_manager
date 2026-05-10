"use client"

import { useId } from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"

interface Props {
    /**
     * [Sprint O] Lifetime sum value của tasks status='Hoàn tất' (VND).
     * Hero number — emerald (= "Lương đã nhận").
     */
    earnedTotal: number
    /**
     * [Sprint O] Lifetime sum value của tasks status ∈ SALARY_PENDING_STATUSES (VND).
     * Secondary number — violet (= "Lương dự kiến").
     */
    pendingTotal: number
    /**
     * Optional sparkline (last 14 days completed daily totals, oldest → newest).
     * Visual decoration only.
     */
    sparkline?: number[]
    locale?: string
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

/**
 * [Sprint O] Net Salary widget — user dashboard.
 *
 * Hero:        "Lương đã nhận"  (lifetime, completed tasks, emerald)
 * Secondary:  "Lương dự kiến"  (pending tasks, violet)
 *
 * Old behavior (showing 0 when user hasn't completed anything this month) was
 * replaced because users wanted lifetime visibility + projected income from
 * in-progress work.
 */
export default function WidgetNetSalary({
    earnedTotal,
    pendingTotal,
    sparkline = [],
    locale = "vi-VN",
    currency = "VND",
}: Props) {
    const gradientId = useId()
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
                minHeight: 160,
            }}
        >
            {/* Header label */}
            <span
                className="text-[11px] font-bold uppercase tracking-widest z-10 relative"
                style={{ color: NP.textMuted }}
            >
                Net Salary
            </span>

            {/* Body — 2 stacked rows */}
            <div className="flex flex-col gap-2.5 z-10 relative mt-1">
                {/* Hero — Lương đã nhận (emerald) */}
                <div className="flex flex-col gap-0.5">
                    <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: NP.textMuted }}
                    >
                        Lương đã nhận
                    </span>
                    <span className="text-[22px] font-extrabold leading-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                        {earnedTotal.toLocaleString(locale)}{" "}
                        <span className="text-[13px] font-semibold opacity-80">{currency}</span>
                    </span>
                </div>

                {/* Secondary — Lương dự kiến (violet) */}
                <div className="flex flex-col gap-0.5">
                    <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: NP.textMuted }}
                    >
                        Lương dự kiến
                    </span>
                    <span className="text-[15px] font-bold leading-tight" style={{ color: "#A78BFA" }}>
                        {pendingTotal.toLocaleString(locale)}{" "}
                        <span className="text-[11px] font-semibold opacity-80">{currency}</span>
                    </span>
                </div>
            </div>

            {/* Sparkline — visual decoration, lifetime daily completed */}
            <div className="absolute inset-x-0 bottom-0 h-[40px] opacity-60 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="v"
                            stroke="#8B5CF6"
                            strokeWidth={1.5}
                            fill={`url(#${gradientId})`}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
