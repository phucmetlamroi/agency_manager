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
    /** Tiền thưởng tháng này (MonthlyBonus.bonusAmount) — đã cộng vào "Lương đã nhận". */
    bonusAmount?: number
    /** Thứ hạng thưởng (1/2/3) nếu được Top — hiện huy chương. */
    rank?: number | null
    /** % thưởng đã áp (để hiện "Top N · X%"). */
    bonusPercent?: number
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

const MEDALS: Record<number, { grad: string; text: string; emoji: string }> = {
    1: { grad: "linear-gradient(135deg,#FFE08A,#F5A524)", text: "#3a2705", emoji: "🥇" },
    2: { grad: "linear-gradient(135deg,#EEF2F7,#A9B6C6)", text: "#22262b", emoji: "🥈" },
    3: { grad: "linear-gradient(135deg,#F0B584,#C26B3F)", text: "#2a1505", emoji: "🥉" },
}

/**
 * [Sprint O] Net Salary widget — user dashboard.
 *
 * Hero:        "Lương đã nhận"  (completed tasks + thưởng tháng này)
 * Secondary:  "Lương dự kiến"  (pending tasks, violet)
 *
 * [Bonus] Nếu user được Top 1/2/3, tiền thưởng được CỘNG vào "Lương đã nhận"
 * và hiện rõ huy chương + dòng "Thưởng Top N · +X đ" để nhân viên biết.
 */
export default function WidgetNetSalary({
    earnedTotal,
    pendingTotal,
    sparkline = [],
    bonusAmount = 0,
    rank = null,
    bonusPercent = 0,
    locale = "vi-VN",
    currency = "VND",
}: Props) {
    const gradientId = useId()
    const chartData = sparkline.length > 0
        ? sparkline.map((v, i) => ({ i, v }))
        : [{ i: 0, v: 0 }]

    const netReceived = earnedTotal + (bonusAmount || 0)
    const medal = rank ? MEDALS[rank] : null

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
            {/* Header label + huy chương Top */}
            <div className="flex items-center justify-between gap-2 z-10 relative">
                <span
                    className="text-[11px] font-bold uppercase tracking-widest"
                    style={{ color: NP.textMuted }}
                >
                    Net Salary
                </span>
                {medal && (
                    <span
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold flex-shrink-0"
                        style={{ background: medal.grad, color: medal.text, boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
                    >
                        <span className="text-[13px] leading-none">{medal.emoji}</span> Top {rank}
                    </span>
                )}
            </div>

            {/* Body — stacked rows */}
            <div className="flex flex-col gap-2.5 z-10 relative mt-1">
                {/* Hero — Lương đã nhận (gồm thưởng) */}
                <div className="flex flex-col gap-0.5">
                    <span
                        className="text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: NP.textMuted }}
                    >
                        Lương đã nhận
                    </span>
                    <span className="text-[22px] font-extrabold leading-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                        {netReceived.toLocaleString(locale)}{" "}
                        <span className="text-[13px] font-semibold opacity-80">{currency}</span>
                    </span>
                    {bonusAmount > 0 && (
                        <span className="text-[11px] font-bold mt-0.5" style={{ color: "#F5C451" }}>
                            🏆 Thưởng Top {rank}{bonusPercent ? ` · ${bonusPercent}%` : ""}: +{bonusAmount.toLocaleString(locale)} {currency}
                        </span>
                    )}
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
