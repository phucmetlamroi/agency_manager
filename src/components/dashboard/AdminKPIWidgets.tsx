"use client"

import { useId } from "react"
import { motion } from "framer-motion"
import { Check, ChevronDown } from "lucide-react"
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

/* ── Reusable sub-components ─────────────────────────────────── */

function TrendBadge({ current, prev }: { current: number; prev: number }) {
    if (prev === 0) return null
    const pct = Math.round(((current - prev) / prev) * 100)
    const up = pct >= 0
    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                up
                    ? "bg-emerald-500/[0.12] text-emerald-400"
                    : "bg-red-500/[0.12] text-red-400"
            }`}
        >
            {up ? "▲" : "▼"} {up ? "+" : ""}
            {pct}%
        </span>
    )
}

function DonutChart({ pct }: { pct: number }) {
    const r = 32
    const stroke = 6
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - pct / 100)
    return (
        <svg width="80" height="80" viewBox="0 0 80 80">
            <circle
                cx="40" cy="40" r={r}
                fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}
            />
            <circle
                cx="40" cy="40" r={r}
                fill="none" stroke="#6366F1" strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round" transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            <text
                x="40" y="44" textAnchor="middle"
                fill="#F4F4F5" fontSize="14" fontWeight="800"
                fontFamily="system-ui, sans-serif"
            >
                {pct}%
            </text>
        </svg>
    )
}

/* ── Card shell matching HustlyTasker glass style ────────────── */

const CARD = [
    "relative overflow-hidden rounded-[20px]",
    "bg-[rgba(24,24,27,0.60)] backdrop-blur-xl",
    "border border-white/[0.06]",
    "shadow-[0_24px_60px_rgba(0,0,0,0.45)]",
    "p-5 flex flex-col gap-2.5 min-w-0",
].join(" ")

/* ── Main export ─────────────────────────────────────────────── */

export function AdminKPIWidgets({ data }: { data: KPIData }) {
    const uid = useId()
    const gradId = `sparkGrad-${uid}`

    const fmt = (n: number) =>
        new Intl.NumberFormat("vi-VN").format(Math.round(n))

    const clientPct =
        data.totalClientsTarget > 0
            ? Math.round((data.totalClients / data.totalClientsTarget) * 100)
            : 0

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ── Card 1 · Gross Revenue ─────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={CARD}
            >
                {/* Ambient orb */}
                <div className="absolute -top-10 -right-10 w-[140px] h-[140px] rounded-full bg-indigo-500 opacity-[0.12] blur-[50px] pointer-events-none" />

                <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.08em]">
                        Gross Revenue
                    </span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1 cursor-default">
                        VNĐ <ChevronDown className="w-3 h-3" />
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-[32px] font-extrabold text-white tracking-tight leading-none">
                            {fmt(data.grossRevenue)}
                        </span>
                        <span className="text-base text-zinc-500 font-medium">đ</span>
                    </div>
                    <div className="flex-1" />
                    {/* Sparkline */}
                    <div className="h-9 w-full max-w-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={data.sparklineData}
                                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                            >
                                <defs>
                                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone" dataKey="v"
                                    stroke="#10B981" strokeWidth={1.5}
                                    fill={`url(#${gradId})`} dot={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <TrendBadge current={data.grossRevenue} prev={data.grossRevenuePrev} />

                <span className="text-[11px] text-zinc-500 mt-auto leading-snug">
                    {data.grossRevenue > data.grossRevenuePrev
                        ? `+${fmt(data.grossRevenue - data.grossRevenuePrev)}đ so với tháng trước`
                        : "Chưa có dữ liệu tháng trước"}
                </span>
            </motion.div>

            {/* ── Card 2 · Total Tasks ───────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={CARD}
            >
                <div className="absolute -top-10 -right-10 w-[140px] h-[140px] rounded-full bg-indigo-500 opacity-[0.12] blur-[50px] pointer-events-none" />

                <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.08em]">
                        Total Tasks
                    </span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1 cursor-default">
                        This week <ChevronDown className="w-3 h-3" />
                    </span>
                </div>

                <div className="flex items-baseline gap-0.5">
                    <span className="text-[32px] font-extrabold text-white tracking-tight leading-none">
                        {data.totalTasks}
                    </span>
                </div>

                {/* Status pills */}
                <div className="flex gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 flex-shrink-0" />
                        {data.tasksInProgress} in progress
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
                        <Check className="w-3 h-3 flex-shrink-0" />
                        {data.tasksCompleted} completed
                    </span>
                </div>

                <TrendBadge current={data.totalTasks} prev={data.totalTasksPrev} />

                <span className="text-[11px] text-zinc-500 mt-auto leading-snug">
                    {data.totalTasks} task đang chạy.{" "}
                    {data.totalTasksPrev > 0
                        ? `${Math.round(((data.totalTasks - data.totalTasksPrev) / data.totalTasksPrev) * 100)}% so với tháng trước`
                        : "Chưa có dữ liệu tháng trước"}
                </span>
            </motion.div>

            {/* ── Card 3 · Total Clients ─────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={CARD}
            >
                <div className="absolute -top-10 -right-10 w-[140px] h-[140px] rounded-full bg-indigo-500 opacity-[0.12] blur-[50px] pointer-events-none" />

                <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.08em]">
                        Total Clients
                    </span>
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1 cursor-default">
                        This week <ChevronDown className="w-3 h-3" />
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-baseline gap-0.5">
                        <span className="text-[32px] font-extrabold text-white tracking-tight leading-none">
                            {data.totalClients}
                        </span>
                        <span className="text-base text-zinc-500 font-medium">
                            /{data.totalClientsTarget}
                        </span>
                    </div>
                    <div className="ml-auto">
                        <DonutChart pct={clientPct} />
                    </div>
                </div>

                {data.clientsNew > 0 && (
                    <TrendBadge
                        current={data.totalClients}
                        prev={Math.max(data.totalClients - data.clientsNew, 1)}
                    />
                )}

                <span className="text-[11px] text-zinc-500 mt-auto leading-snug">
                    Đạt {clientPct}% mục tiêu tháng này
                    {data.clientsNew > 0 && (
                        <span className="text-emerald-400 font-semibold ml-1">
                            +{data.clientsNew} client mới
                        </span>
                    )}
                </span>
            </motion.div>
        </div>
    )
}
