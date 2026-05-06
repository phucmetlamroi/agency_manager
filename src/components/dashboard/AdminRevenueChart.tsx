"use client"

import { ChevronDown, TrendingUp } from "lucide-react"
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

/* -- Custom tooltip — Neon Purple Dark ----------------------------------- */

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
    if (active && payload && payload.length) {
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
                <p style={{ color: "#D8B4FE", fontWeight: 700 }}>
                    ${Number(payload[0].value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
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

    /* Split dollar value into whole and decimal parts for muted-decimal style */
    const [wholeStr, decimalStr] = formattedRevenue.split(".")

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

                    {/* Value */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
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
                    </div>

                    {/* Trend badge */}
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            background: "#211B31",
                            borderRadius: 999,
                            padding: "4px 10px",
                            width: "fit-content",
                        }}
                    >
                        <TrendingUp
                            size={13}
                            style={{
                                color: "#D8B4FE",
                                transform: up ? "none" : "scaleY(-1)",
                            }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#D8B4FE" }}>
                            {pctRounded}% vs last week
                        </span>
                    </div>

                    {/* Description */}
                    <p style={{ fontSize: 13, color: "#A1A1AA", marginTop: 2, lineHeight: 1.5 }}>
                        Revenue is maintaining a{" "}
                        <span style={{ color: "#D8B4FE", fontWeight: 600 }}>steady growth</span>{" "}
                        trend this week.
                    </p>
                </div>

                {/* Right: dropdown pill */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        border: "1px solid rgba(139,92,246,0.15)",
                        borderRadius: 999,
                        padding: "6px 12px",
                        cursor: "pointer",
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 12, color: "#A1A1AA", fontWeight: 500 }}>This week</span>
                    <ChevronDown size={14} style={{ color: "#A1A1AA" }} />
                </div>
            </div>

            {/* ── Chart area ─────────────────────────────────────── */}
            <div style={{ flex: 1, minHeight: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                        <defs>
                            <linearGradient id="neonPurpleGrad" x1="0" y1="0" x2="0" y2="1">
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
                        />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Single line — Revenue only */}
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#8B5CF6"
                            strokeWidth={2.5}
                            fill="url(#neonPurpleGrad)"
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
