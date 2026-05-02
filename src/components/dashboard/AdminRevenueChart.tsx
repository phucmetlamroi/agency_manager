"use client"

import { motion } from "framer-motion"
import { TrendingUp, TrendingDown } from "lucide-react"
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

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 shadow-xl text-xs">
                <p className="text-zinc-400 mb-1">{label}</p>
                <p className="text-emerald-400 font-bold">
                    {new Intl.NumberFormat('vi-VN').format(Math.round(Number(payload[0].value ?? 0)))}đ
                </p>
            </div>
        )
    }
    return null
}

export function AdminRevenueChart({ data, totalRevenue, prevRevenue }: Props) {
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n))
    const pct = prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : 0
    const up = pct >= 0

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-md shadow-xl shadow-black/40 p-6 flex flex-col gap-4"
        >
            {/* Ambient glow */}
            <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-indigo-500/8 blur-3xl rounded-full pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-zinc-300">Revenue Overview</p>
                <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-md">Tuần này</span>
            </div>

            {/* Hero number */}
            <div>
                <p className="text-3xl font-black text-zinc-100">
                    {fmt(totalRevenue)}
                    <span className="text-base font-bold text-zinc-400 ml-1">đ</span>
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                    }`}>
                        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {up ? "+" : ""}{pct}% vs tuần trước
                    </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                    Doanh thu đang duy trì xu hướng tăng trưởng ổn định.
                </p>
            </div>

            {/* Chart */}
            <div className="h-44 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                        <defs>
                            <linearGradient id="revAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis
                            dataKey="day"
                            tick={{ fill: "#71717a", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tick={{ fill: "#71717a", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v === 0 ? "0" : `${Math.round(v / 1000)}k`}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#6366F1"
                            strokeWidth={2}
                            fill="url(#revAreaGrad)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#6366F1", strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    )
}
