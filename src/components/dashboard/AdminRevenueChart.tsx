"use client"

import { motion } from "framer-motion"
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

/* ── Custom tooltip matching the glass style ─────────────────── */

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
                <p className="text-zinc-400 mb-1">{label}</p>
                <p className="text-indigo-400 font-bold">
                    {new Intl.NumberFormat("vi-VN").format(
                        Math.round(Number(payload[0].value ?? 0))
                    )}
                    đ
                </p>
                {payload[1] && Number(payload[1].value ?? 0) > 0 && (
                    <p className="text-violet-400 font-semibold mt-0.5">
                        {Math.round(Number(payload[1].value ?? 0))} tasks
                    </p>
                )}
            </div>
        )
    }
    return null
}

/* ── Main export ─────────────────────────────────────────────── */

export function AdminRevenueChart({ data, totalRevenue, prevRevenue }: Props) {
    const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n))
    const pct =
        prevRevenue > 0
            ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100)
            : 0
    const up = pct >= 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={[
                "relative overflow-hidden rounded-[20px]",
                "bg-[rgba(24,24,27,0.60)] backdrop-blur-[12px]",
                "border border-white/[0.06]",
                "shadow-[0_24px_60px_rgba(0,0,0,0.45)]",
                "p-5 flex flex-col gap-3",
            ].join(" ")}
        >
            {/* Ambient orb */}
            <div className="absolute -bottom-16 -left-16 w-[200px] h-[200px] rounded-full bg-violet-500 opacity-[0.08] blur-[60px] pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.08em]">
                        Revenue Overview
                    </div>
                    <div className="flex items-baseline gap-2.5 mt-1">
                        <span className="text-[26px] font-extrabold text-zinc-100">
                            {fmt(totalRevenue)}
                            <span className="text-sm font-bold text-zinc-400 ml-1">đ</span>
                        </span>
                        <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                up
                                    ? "bg-emerald-500/[0.12] text-emerald-400"
                                    : "bg-red-500/[0.12] text-red-400"
                            }`}
                        >
                            {up ? "▲" : "▼"} {up ? "+" : ""}
                            {pct}% vs tuần trước
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Doanh thu đang duy trì xu hướng tăng trưởng ổn định.
                    </p>
                </div>
                <span className="text-[11px] text-zinc-500 flex items-center gap-1 cursor-default flex-shrink-0">
                    Tuần này <ChevronDown className="w-3 h-3" />
                </span>
            </div>

            {/* Chart */}
            <div className="h-[180px] w-full mt-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="revAreaPrimary" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="revAreaSecondary" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
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
                            tick={{ fill: "#71717A", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) =>
                                v === 0 ? "0" : `${Math.round(v / 1000)}k`
                            }
                        />
                        <Tooltip content={<CustomTooltip />} />
                        {/* Primary line — Revenue */}
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#6366F1"
                            strokeWidth={2}
                            fill="url(#revAreaPrimary)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#6366F1", strokeWidth: 0 }}
                        />
                        {/* Secondary line — Tasks (scaled visually) */}
                        <Area
                            type="monotone"
                            dataKey="tasks"
                            stroke="#8B5CF6"
                            strokeWidth={1.5}
                            fill="url(#revAreaSecondary)"
                            dot={false}
                            activeDot={{ r: 3, fill: "#8B5CF6", strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    )
}
