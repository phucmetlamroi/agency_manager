"use client"

import { useCallback, useId, useState } from "react"
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
    revenue: number     // VND
    tasks: number
}

interface Props {
    /** Daily revenue series in VND (oldest → newest) */
    data: RevenuePoint[]
    /** [Sprint O] Lifetime workspace revenue in VND (= projectedRevenueVND).
     *  Mirrors /admin/finance "TOTAL REVENUE" bottom summary. */
    totalRevenueVND: number
    /** Exchange rate for client-side VND ↔ USD toggle. */
    exchangeRate: number
}

/* -- Main export --------------------------------------------------------- */

export function AdminRevenueChart({ data, totalRevenueVND, exchangeRate }: Props) {
    // [Sprint O audit-fix] useId for gradient — collision-safe if multiple
    // AdminRevenueChart instances render on same page in future.
    const uid = useId()
    const gradId = `revGrad-${uid}`

    // [Sprint O] Currency toggle state — default VND
    const [currency, setCurrency] = useState<"VND" | "USD">("VND")
    const toggleCurrency = () =>
        setCurrency((c) => (c === "VND" ? "USD" : "VND"))

    const totalDisplay =
        currency === "VND"
            ? totalRevenueVND
            : totalRevenueVND / Math.max(exchangeRate, 1)

    const formattedRevenue =
        currency === "VND"
            ? Math.round(totalDisplay).toLocaleString("vi-VN")
            : totalDisplay.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              })

    /* Split decimal for muted-decimal style (USD only — VND no decimals) */
    const [wholeStr, decimalStr] =
        currency === "USD" ? formattedRevenue.split(".") : [formattedRevenue, ""]

    // [Sprint O audit-fix] Tooltip render fn memoized — avoid re-mount each render.
    // Recharts re-renders Tooltip when content prop identity changes. useCallback
    // re-creates only when currency or exchangeRate change.
    const renderTooltip = useCallback(
        ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
            if (active && payload && payload.length) {
                const rawVND = Number(payload[0].value ?? 0)
                const display =
                    currency === "VND"
                        ? `${Math.round(rawVND).toLocaleString("vi-VN")} đ`
                        : `$${(rawVND / Math.max(exchangeRate, 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                return (
                    <div
                        className="px-3.5 py-2.5 text-xs shadow-2xl"
                        style={{
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            background: "#121016",
                            border: "1px solid rgba(139,92,246,0.2)",
                            borderRadius: 14,
                        }}
                    >
                        <p style={{ color: "#A1A1AA", marginBottom: 4 }}>{label}</p>
                        <p style={{ color: "#D8B4FE", fontWeight: 700 }}>{display}</p>
                    </div>
                )
            }
            return null
        },
        [currency, exchangeRate],
    )

    return (
        <div
            style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                flex: 1.5,
                background: "#0A0A0A",
                border: "1px solid rgba(139,92,246,0.15)",
                borderRadius: 26,
                padding: "28px 32px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
                overflow: "hidden",
                position: "relative",
            }}
        >
            {/* ── Header row ─────────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                {/* Left: title + value + badge + description */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {/* Title */}
                    <span
                        style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "#FFFFFF",
                            lineHeight: 1.3,
                        }}
                    >
                        Revenue Overview
                    </span>

                    {/* Value — [Sprint O] VND/USD aware */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: currency === "USD" ? 0 : 6 }}>
                        {currency === "USD" ? (
                            <>
                                <span
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 800,
                                        color: "#FFFFFF",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    ${wholeStr}
                                </span>
                                <span
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 800,
                                        color: "#A1A1AA",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    .{decimalStr}
                                </span>
                            </>
                        ) : (
                            <>
                                <span
                                    style={{
                                        fontSize: 32,
                                        fontWeight: 800,
                                        color: "#FFFFFF",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    {wholeStr}
                                </span>
                                <span
                                    style={{
                                        fontSize: 18,
                                        fontWeight: 600,
                                        color: "#A1A1AA",
                                        lineHeight: 1.2,
                                    }}
                                >
                                    đ
                                </span>
                            </>
                        )}
                    </div>

                    {/* Description — [Sprint O] lifetime mirror of Finance page */}
                    <p style={{ fontSize: 13, color: "#A1A1AA", marginTop: 2, lineHeight: 1.5 }}>
                        Tổng doanh thu{" "}
                        <span style={{ color: "#D8B4FE", fontWeight: 600 }}>workspace</span>{" "}
                        (dự kiến toàn bộ task, mirror /admin/finance).
                    </p>
                </div>

                {/* Right: currency toggle — [Sprint O] click to switch VND ↔ USD */}
                <button
                    type="button"
                    onClick={toggleCurrency}
                    aria-label={`Toggle currency (current: ${currency})`}
                    aria-pressed={currency === "USD"}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        border: "1px solid rgba(139,92,246,0.15)",
                        borderRadius: 999,
                        padding: "6px 12px",
                        cursor: "pointer",
                        flexShrink: 0,
                        background: "transparent",
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(139,92,246,0.06)"
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent"
                    }}
                >
                    <span style={{ fontSize: 12, color: "#A1A1AA", fontWeight: 500 }}>
                        {currency}
                    </span>
                    <ChevronDown size={14} style={{ color: "#A1A1AA" }} />
                </button>
            </div>

            {/* ── Chart area ─────────────────────────────────────── */}
            <div style={{ flex: 1, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="rgba(139,92,246,0.25)" stopOpacity={1} />
                                <stop offset="100%" stopColor="rgba(139,92,246,0)" stopOpacity={1} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="4 4"
                            stroke="rgba(139,92,246,0.08)"
                            vertical={true}
                        />

                        <XAxis
                            dataKey="day"
                            tick={{
                                fill: "#A1A1AA",
                                fontSize: 11,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            tick={{
                                fill: "#A1A1AA",
                                fontSize: 11,
                                fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value: number) => {
                                if (currency === "USD") {
                                    const usd = value / Math.max(exchangeRate, 1)
                                    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`
                                    return `$${usd.toFixed(0)}`
                                }
                                if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
                                if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`
                                return String(value)
                            }}
                        />

                        <Tooltip content={renderTooltip} />

                        {/* Single line — Revenue only */}
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#8B5CF6"
                            strokeWidth={2.5}
                            fill={`url(#${gradId})`}
                            dot={false}
                            activeDot={{
                                r: 5,
                                fill: "#8B5CF6",
                                stroke: "#0A0A0A",
                                strokeWidth: 2,
                            }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
