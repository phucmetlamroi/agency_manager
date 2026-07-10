"use client"

import { useId, useState } from "react"
import { motion } from "framer-motion"
import { Check, ChevronDown, ArrowUp, ArrowDown } from "lucide-react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"

interface KPIData {
    /** [Sprint O] Total workspace revenue in VND (= projectedRevenueVND from
     *  finance helper, mirrors /admin/finance "TOTAL REVENUE" bottom). */
    grossRevenueVND: number
    /** Exchange rate for client-side VND ↔ USD toggle. */
    exchangeRate: number
    totalTasks: number
    totalTasksPrev: number
    tasksInProgress: number
    tasksCompleted: number
    totalClients: number
    totalClientsTarget: number
    clientsNew: number
    sparklineData: Array<{ v: number }>
}

/* ── Helpers ─────────────────────────────────────────────────── */

function formatVND(n: number): string {
    return new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 0,
    }).format(Math.round(n))
}

function formatUSD(n: number): string {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)
}

function pctChange(current: number, prev: number): number | null {
    if (prev === 0) return null
    return Math.round(((current - prev) / prev) * 100)
}

/* ── Reusable sub-components ─────────────────────────────────── */

function TrendBadge({ current, prev }: { current: number; prev: number }) {
    const pct = pctChange(current, prev)
    if (pct === null) return null
    const up = pct >= 0
    return (
        <span
            className="inline-flex items-center gap-[5px] text-[13px] font-bold px-3 py-1 rounded-[23px]"
            style={{ backgroundColor: "#211B31", color: "hsl(var(--primary-accent))" }}
        >
            {up ? (
                <ArrowUp className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
            ) : (
                <ArrowDown className="w-3.5 h-3.5" style={{ color: "hsl(var(--primary))" }} />
            )}
            {up ? "+" : ""}
            {pct}%
        </span>
    )
}

function DonutChart({ pct }: { pct: number }) {
    const r = 36
    const stroke = 7
    const circ = 2 * Math.PI * r
    const offset = circ * (1 - pct / 100)
    return (
        <div className="relative flex items-center gap-3">
            <svg width="90" height="90" viewBox="0 0 90 90">
                <circle
                    cx="45" cy="45" r={r}
                    fill="none" stroke="#211B31" strokeWidth={stroke}
                />
                <circle
                    cx="45" cy="45" r={r}
                    fill="none" stroke="#8B5CF6" strokeWidth={stroke}
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(-90 45 45)"
                    className="transition-[stroke-dashoffset] duration-[600ms] ease-in-out"
                />
            </svg>
            <span
                className="text-[22px] font-extrabold"
                style={{ color: "hsl(var(--primary-accent))", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
                {pct}%
            </span>
        </div>
    )
}

/* ── Dropdown pill sub-component ─────────────────────────────── */

function DropdownPill({ label }: { label: string }) {
    return (
        <span
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1 rounded-[20px] cursor-pointer transition-colors duration-150"
            style={{
                border: "1px solid rgba(139,92,246,0.15)",
                color: "#A1A1AA",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
        >
            {label} <ChevronDown className="w-3.5 h-3.5" />
        </span>
    )
}

/* ── [Sprint O] Currency toggle pill (VND ↔ USD) ───────────── */

function CurrencyToggle({
    currency,
    onToggle,
}: {
    currency: "VND" | "USD"
    onToggle: () => void
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={`Đổi đơn vị tiền (hiện tại: ${currency})`}
            aria-pressed={currency === "USD"}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1 rounded-[20px] transition-colors duration-150"
            style={{
                border: "1px solid rgba(139,92,246,0.15)",
                color: "#A1A1AA",
                background: "transparent",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                cursor: "pointer",
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(139,92,246,0.06)"
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent"
            }}
        >
            {currency} <ChevronDown className="w-3.5 h-3.5" />
        </button>
    )
}

/* ── Main export ─────────────────────────────────────────────── */

export function AdminKPIWidgets({ data }: { data: KPIData }) {
    const uid = useId()
    const gradId = `sparkGrad-${uid}`

    // [Sprint O] Currency toggle state — default VND (matches Finance page)
    const [currency, setCurrency] = useState<"VND" | "USD">("VND")
    const toggleCurrency = () =>
        setCurrency((c) => (c === "VND" ? "USD" : "VND"))

    // Convert big number based on toggle. Sparkline stays VND (visual decor).
    const grossRevenueDisplay =
        currency === "VND"
            ? data.grossRevenueVND
            : data.grossRevenueVND / Math.max(data.exchangeRate, 1)

    const clientPct =
        data.totalClientsTarget > 0
            ? Math.round((data.totalClients / data.totalClientsTarget) * 100)
            : 0

    const taskPct = pctChange(data.totalTasks, data.totalTasksPrev)

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* ── Card 1 : Gross Revenue ─────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.4, ease: "easeOut" }}
                className="relative overflow-hidden rounded-[26px] p-5 flex flex-col gap-4 min-w-0 transition-colors duration-150"
                style={{
                    backgroundColor: "#0A0A0A",
                    border: "1px solid rgba(139,92,246,0.15)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                whileHover={{
                    borderColor: "rgba(139,92,246,0.25)",
                }}
            >
                {/* Header row — [Sprint O] toggle pill */}
                <div className="flex justify-between items-center">
                    <span className="text-[18px] font-bold text-white">
                        Tổng doanh thu
                    </span>
                    <CurrencyToggle currency={currency} onToggle={toggleCurrency} />
                </div>

                {/* Value row + sparkline */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-3">
                        {currency === "VND" ? (
                            <div className="flex items-baseline gap-1">
                                <span className="text-[36px] font-extrabold text-white tracking-[-0.02em] leading-none">
                                    {formatVND(grossRevenueDisplay)}
                                </span>
                                <span className="text-[18px] font-medium leading-none" style={{ color: "#A1A1AA" }}>
                                    đ
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[36px] font-extrabold text-white tracking-[-0.02em] leading-none">
                                    ${formatUSD(grossRevenueDisplay).split(".")[0]}
                                </span>
                                <span className="text-[20px] font-medium leading-none" style={{ color: "#A1A1AA" }}>
                                    .{formatUSD(grossRevenueDisplay).split(".")[1]}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Sparkline */}
                    <div className="h-[60px] w-[140px] flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={data.sparklineData}
                                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                            >
                                <defs>
                                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="rgba(139,92,246,0.3)" stopOpacity={1} />
                                        <stop offset="100%" stopColor="rgba(139,92,246,0)" stopOpacity={1} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone" dataKey="v"
                                    stroke="#8B5CF6" strokeWidth={2}
                                    fill={`url(#${gradId})`} dot={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Footer — [Sprint O] mirrors /admin/finance TOTAL REVENUE */}
                <span className="text-[13px] mt-auto leading-snug" style={{ color: "#A1A1AA", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Tổng doanh thu <span style={{ color: "hsl(var(--primary-accent))", fontWeight: 600 }}>workspace</span> (dự kiến toàn bộ task chưa archive).
                </span>
            </motion.div>

            {/* ── Card 2 : Total Tasks ───────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
                className="relative overflow-hidden rounded-[26px] p-5 flex flex-col gap-4 min-w-0 transition-colors duration-150"
                style={{
                    backgroundColor: "#0A0A0A",
                    border: "1px solid rgba(139,92,246,0.15)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                whileHover={{
                    borderColor: "rgba(139,92,246,0.25)",
                }}
            >
                {/* Header row */}
                <div className="flex justify-between items-center">
                    <span className="text-[18px] font-bold text-white">
                        Tổng số task
                    </span>
                    <DropdownPill label="Tuần này" />
                </div>

                {/* Value */}
                <div className="flex items-center gap-3">
                    <span className="text-[36px] font-extrabold text-white tracking-[-0.02em] leading-none">
                        {data.totalTasks}
                    </span>
                </div>

                {/* Trend badge */}
                <TrendBadge current={data.totalTasks} prev={data.totalTasksPrev} />

                {/* Status pills row */}
                <div className="flex gap-2.5 flex-wrap">
                    <span
                        className="inline-flex items-center gap-[6px] text-[13px] font-medium px-3 py-1.5 rounded-[20px]"
                        style={{
                            backgroundColor: "#121016",
                            border: "1px solid rgba(139,92,246,0.1)",
                            color: "#A1A1AA",
                            boxShadow: "0 2px 8px rgba(139,92,246,0.06)",
                        }}
                    >
                        <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: "hsl(var(--primary))" }}
                        />
                        {data.tasksInProgress} task đang làm
                    </span>
                    <span
                        className="inline-flex items-center gap-[6px] text-[13px] font-medium px-3 py-1.5 rounded-[20px]"
                        style={{
                            backgroundColor: "#121016",
                            border: "1px solid rgba(139,92,246,0.1)",
                            color: "#A1A1AA",
                            boxShadow: "0 2px 8px rgba(139,92,246,0.06)",
                        }}
                    >
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(var(--primary))" }} />
                        {data.tasksCompleted} task hoàn tất
                    </span>
                </div>

                {/* Footer */}
                <span className="text-[13px] mt-auto leading-snug" style={{ color: "#A1A1AA", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Bạn đang có <span style={{ color: "hsl(var(--primary-accent))", fontWeight: 600 }}>{data.totalTasks}</span> task đang chạy
                    {taskPct !== null
                        ? <>, <span style={{ color: "hsl(var(--primary-accent))", fontWeight: 600 }}>{taskPct >= 0 ? "nhiều hơn" : "ít hơn"} {taskPct > 0 ? taskPct : Math.abs(taskPct)}%</span> so với tháng trước.</>
                        : "."}
                </span>
            </motion.div>

            {/* ── Card 3 : Total Clients ─────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
                className="relative overflow-hidden rounded-[26px] p-5 flex flex-col gap-4 min-w-0 transition-colors duration-150"
                style={{
                    backgroundColor: "#0A0A0A",
                    border: "1px solid rgba(139,92,246,0.15)",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
                whileHover={{
                    borderColor: "rgba(139,92,246,0.25)",
                }}
            >
                {/* Header row */}
                <div className="flex justify-between items-center">
                    <span className="text-[18px] font-bold text-white">
                        Tổng khách hàng
                    </span>
                    <DropdownPill label="Tuần này" />
                </div>

                {/* Value + Donut */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-baseline gap-0.5">
                            <span className="text-[36px] font-extrabold text-white tracking-[-0.02em] leading-none">
                                {data.totalClients}
                            </span>
                            <span className="text-[20px] font-medium leading-none" style={{ color: "#A1A1AA" }}>
                                /{data.totalClientsTarget}
                            </span>
                        </div>
                        {/* Trend badge */}
                        {data.clientsNew > 0 && (
                            <TrendBadge
                                current={data.totalClients}
                                prev={Math.max(data.totalClients - data.clientsNew, 1)}
                            />
                        )}
                    </div>
                    <DonutChart pct={clientPct} />
                </div>

                {/* Footer */}
                <span className="text-[13px] mt-auto leading-snug" style={{ color: "#A1A1AA", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    Bạn đã đạt <span style={{ color: "hsl(var(--primary-accent))", fontWeight: 600 }}>{clientPct}%</span> mục tiêu tuần này.
                </span>
            </motion.div>
        </div>
    )
}
