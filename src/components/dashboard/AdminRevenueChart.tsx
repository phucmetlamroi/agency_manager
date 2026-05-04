"use client"

import { ChevronDown } from "lucide-react"
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    type TooltipProps,
} from "recharts"
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent"

interface RevenuePoint {
    day: string
    revenue: number
    tasks: number
}

interface Props {
    data: RevenuePoint[]
    totalRevenue: number
    prevRevenue: number
}

/* -- Custom tooltip matching the glass style ----------------------------- */

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
                <p className="mb-1 text-zinc-400">{label}</p>
                <p className="font-bold text-indigo-400">
                    ${Number(payload[0].value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {payload[1] && Number(payload[1].value ?? 0) > 0 && (
                    <p className="mt-0.5 font-semibold text-violet-400">
                        {Math.round(Number(payload[1].value ?? 0))} tasks
                    </p>
                )}
            </div>
        )
    }
    return null
}

/* -- Main export --------------------------------------------------------- */

export function AdminRevenueChart({ data, totalRevenue, prevRevenue }: Props) {
    const pct =
        prevRevenue > 0
            ? ((totalRevenue - prevRevenue) / prevRevenue) * 100
            : 0
    const pctRounded = Math.round(pct * 100) / 100
    const up = pct >= 0

    const formattedRevenue = totalRevenue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

    return (
        <div
            className="relative flex flex-col gap-3 overflow-hidden rounded-[20px] border border-white/[0.06] p-5"
            style={{
                flex: 1.5,
                background: "rgba(24,24,27,0.60)",
                backdropFilter: "blur(12px)",
            }}
        >
            {/* Ambient orb */}
            <div className="pointer-events-none absolute -bottom-[60px] -left-[60px] h-[200px] w-[200px] rounded-full bg-[#8B5CF6] opacity-[0.08] blur-[60px]" />

            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    {/* Label */}
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">
                        Revenue Overview
                    </div>

                    {/* Value + badge */}
                    <div className="mt-1 flex items-baseline gap-2.5">
                        <span className="text-[26px] font-extrabold text-zinc-100">
                            ${formattedRevenue}
                        </span>
                        <span
                            className={[
                                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                up
                                    ? "bg-emerald-500/[0.12] text-emerald-400"
                                    : "bg-red-500/[0.12] text-red-400",
                            ].join(" ")}
                        >
                            {up ? "▲" : "▼"} {pctRounded}% vs last week
                        </span>
                    </div>

                    {/* Subtitle */}
                    <p className="mt-1 text-xs text-zinc-500">
                        Revenue is maintaining a steady growth trend this week.
                    </p>
                </div>

                {/* Dropdown */}
                <span className="flex flex-shrink-0 cursor-pointer items-center gap-1 text-[11px] text-zinc-500">
                    This week <ChevronDown className="h-3 w-3" />
                </span>
            </div>

            {/* Chart area */}
            <div className="min-h-[180px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="revGradientIndigo" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6366F1" stopOpacity={0.25} />
                                <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="revGradientViolet" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.15} />
                                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.04)"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="day"
                            tick={{ fill: "#71717A", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            tick={{ fill: "#71717A", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Primary line -- Revenue */}
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#6366F1"
                            strokeWidth={2}
                            fill="url(#revGradientIndigo)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#6366F1", strokeWidth: 0 }}
                        />

                        {/* Secondary line -- Tasks */}
                        <Area
                            type="monotone"
                            dataKey="tasks"
                            stroke="#8B5CF6"
                            strokeWidth={1.5}
                            fill="url(#revGradientViolet)"
                            dot={false}
                            activeDot={{ r: 3, fill: "#8B5CF6", strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
