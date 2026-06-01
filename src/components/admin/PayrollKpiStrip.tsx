'use client'

import { motion } from 'framer-motion'
import { Wallet, Hourglass, Users, CheckCircle2, CircleDashed, type LucideIcon } from 'lucide-react'

/**
 * Dải KPI tổng quan cho trang Payroll.
 * Tái lập NGUYÊN công thức thị giác của Dashboard (AdminKPIWidgets):
 * thẻ phẳng #0A0A0A, viền tím 15% (hover 25%), số trắng extrabold,
 * accent tím #D8B4FE, Framer stagger. Thuần hiển thị — không chạm dữ liệu.
 */

export type PayrollTotals = {
    net: number      // Tổng thực nhận (taskIncome + bonus)
    est: number      // Tổng dự kiến (pending)
    people: number   // Số nhân sự có lương kỳ này
    done: number     // Tổng task hoàn tất
    unpaid: number   // Số người chưa thanh toán
}

const FONT = "'Plus Jakarta Sans', sans-serif"

function formatVND(n: number): string {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(n || 0))
}

type Item = {
    key: string
    label: string
    value: string
    unit?: string
    valueColor: string
    icon: LucideIcon
    foot?: string
}

export default function PayrollKpiStrip({ totals }: { totals: PayrollTotals }) {
    const paid = Math.max(totals.people - totals.unpaid, 0)
    const paidPct = totals.people > 0 ? Math.round((paid / totals.people) * 100) : 0

    const items: Item[] = [
        { key: 'net', label: 'Tổng thực nhận', value: formatVND(totals.net), unit: 'đ', valueColor: '#FFFFFF', icon: Wallet, foot: 'Đã gồm thưởng kỳ này' },
        { key: 'est', label: 'Tổng dự kiến', value: formatVND(totals.est), unit: 'đ', valueColor: totals.est > 0 ? '#D8B4FE' : '#52525B', icon: Hourglass, foot: 'Task đang xử lý' },
        { key: 'people', label: 'Nhân sự', value: String(totals.people), valueColor: '#FFFFFF', icon: Users, foot: 'Có lương kỳ này' },
        { key: 'done', label: 'Task hoàn tất', value: String(totals.done), valueColor: '#FFFFFF', icon: CheckCircle2, foot: 'Đã nghiệm thu' },
        { key: 'unpaid', label: 'Chưa thanh toán', value: String(totals.unpaid), valueColor: totals.unpaid > 0 ? '#FFFFFF' : '#52525B', icon: CircleDashed },
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {items.map((it, i) => {
                const Icon = it.icon
                return (
                    <motion.div
                        key={it.key}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + i * 0.05, duration: 0.4, ease: 'easeOut' }}
                        whileHover={{ borderColor: 'rgba(139,92,246,0.25)' }}
                        className="relative overflow-hidden rounded-[26px] p-5 flex flex-col gap-3 min-w-0 transition-colors duration-150"
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(139,92,246,0.15)', fontFamily: FONT }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium truncate" style={{ color: '#A1A1AA' }}>
                                {it.label}
                            </span>
                            <span
                                className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0"
                                style={{ backgroundColor: 'rgba(139,92,246,0.1)' }}
                            >
                                <Icon className="w-4 h-4" style={{ color: '#D8B4FE' }} />
                            </span>
                        </div>

                        <div className="flex items-baseline gap-1 min-w-0">
                            <span
                                className="text-[24px] font-extrabold tracking-[-0.02em] leading-none tabular-nums truncate"
                                style={{ color: it.valueColor }}
                            >
                                {it.value}
                            </span>
                            {it.unit && (
                                <span className="text-[15px] font-medium leading-none flex-shrink-0" style={{ color: '#A1A1AA' }}>
                                    {it.unit}
                                </span>
                            )}
                        </div>

                        {it.key === 'unpaid' ? (
                            <div className="mt-auto">
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#211B31' }}>
                                    <motion.div
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: '#8B5CF6' }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${paidPct}%` }}
                                        transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
                                    />
                                </div>
                                <div className="text-[11px] mt-1.5" style={{ color: '#A1A1AA' }}>
                                    Đã trả <span style={{ color: '#D8B4FE', fontWeight: 600 }}>{paid}</span>/{totals.people}
                                </div>
                            </div>
                        ) : (
                            <span className="text-[12px] mt-auto leading-snug" style={{ color: '#A1A1AA' }}>
                                {it.foot}
                            </span>
                        )}
                    </motion.div>
                )
            })}
        </div>
    )
}
