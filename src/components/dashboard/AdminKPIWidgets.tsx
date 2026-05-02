"use client"

import { useId } from "react"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown } from "lucide-react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"

interface KPIData {
    grossRevenue: number
    grossRevenuePrev: number
    totalTasks: number
    totalTasksPrev: number
    tasksInProgress: number
    tasksCompleted: number
    totalClients: number
    totalClientsTarget: number
    clientsNew: number
    sparklineData: Array<{ v: number }>
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
    if (prev === 0) return null
    const pct = Math.round(((current - prev) / prev) * 100)
    const up = pct >= 0
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
            up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {up ? "+" : ""}{pct}%
        </span>
    )
}

const card = "relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-md shadow-xl shadow-black/40 p-6 flex flex-col gap-3"

export function AdminKPIWidgets({ data }: { data: KPIData }) {
    const uid = useId()
    const gradId = `revGrad-${uid}`

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n))
    const clientPct = data.totalClientsTarget > 0
        ? Math.round((data.totalClients / data.totalClientsTarget) * 100)
        : 0

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ── Card 1: Gross Revenue ── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={card}
            >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-emerald-500/6 blur-2xl rounded-full pointer-events-none" />
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold text-zinc-400 mb-1">Gross Revenue</p>
                        <p className="text-2xl font-black text-zinc-100">
                            {fmt(data.grossRevenue)}
                            <span className="text-sm font-bold text-zinc-400 ml-1">đ</span>
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-md">VNĐ</span>
                        <TrendBadge current={data.grossRevenue} prev={data.grossRevenuePrev} />
                    </div>
                </div>

                {/* Sparkline */}
                <div className="h-12 mt-1">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.sparklineData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="v" stroke="#10B981" strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <p className="text-[11px] text-zinc-500 leading-snug">
                    {data.grossRevenue > data.grossRevenuePrev
                        ? `+${fmt(data.grossRevenue - data.grossRevenuePrev)}đ so với tháng trước`
                        : "Chưa có dữ liệu tháng trước"}
                </p>
            </motion.div>

            {/* ── Card 2: Total Tasks ── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={card}
            >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-indigo-500/6 blur-2xl rounded-full pointer-events-none" />
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold text-zinc-400 mb-1">Total Tasks</p>
                        <p className="text-4xl font-black text-zinc-100">{data.totalTasks}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-md">Tất cả</span>
                        <TrendBadge current={data.totalTasks} prev={data.totalTasksPrev} />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-1">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-400">{data.tasksInProgress} task đang xử lý</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="text-xs text-zinc-400">{data.tasksCompleted} task hoàn tất</span>
                    </div>
                </div>

                <p className="text-[11px] text-zinc-500 mt-auto leading-snug">
                    {data.totalTasks} task đang chạy,{" "}
                    {data.totalTasksPrev > 0
                        ? `${Math.round(((data.totalTasks - data.totalTasksPrev) / data.totalTasksPrev) * 100)}% so với tháng trước`
                        : "chưa có dữ liệu tháng trước"}
                </p>
            </motion.div>

            {/* ── Card 3: Total Clients ── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={card}
            >
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-cyan-500/6 blur-2xl rounded-full pointer-events-none" />
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-semibold text-zinc-400 mb-1">Total Clients</p>
                        <p className="text-2xl font-black text-zinc-100">
                            {data.totalClients}
                            <span className="text-sm font-medium text-zinc-500">/{data.totalClientsTarget}</span>
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-md">Tháng này</span>
                        {data.clientsNew > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                                <TrendingUp className="w-3 h-3" />
                                +{Math.round((data.clientsNew / Math.max(data.totalClients - data.clientsNew, 1)) * 100)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* Donut-style progress ring */}
                <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#27272a" strokeWidth="4" />
                            <circle
                                cx="18" cy="18" r="14"
                                fill="none"
                                stroke="#22D3EE"
                                strokeWidth="4"
                                strokeDasharray={`${clientPct * 0.88} 88`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-zinc-200">{clientPct}%</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                        Đạt {clientPct}% mục tiêu tháng này
                        {data.clientsNew > 0 && (
                            <span className="block text-emerald-400 font-semibold mt-0.5">
                                +{data.clientsNew} client mới
                            </span>
                        )}
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
