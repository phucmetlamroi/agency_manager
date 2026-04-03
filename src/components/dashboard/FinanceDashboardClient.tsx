'use client'

import { useState } from 'react'

type FinanceMode = 'team' | 'personal'
type CurrencyMode = 'VND' | 'USD'

interface FinanceData {
    // Actual
    totalRevenueVND: number
    totalWageVND: number
    netProfit: number
    profitMargin: number
    completedCount: number
    // Projected
    projectedRevenueVND: number
    projectedWageVND: number
    projectedNetProfit: number
    projectedMargin: number
    allTasksCount: number
    pendingCount: number
    // Exchange rate
    exchangeRate: number
    // Transactions
    transactions: {
        id: string
        title: string
        status: string
        assignee: string
        revenueVND: number
        wageVND: number
        netProfitVND: number
        jobPriceUSD: number
        isCompleted: boolean
    }[]
}

function formatCurrency(amount: number, currency: CurrencyMode, exchangeRate: number): string {
    if (currency === 'USD') {
        const usd = amount / exchangeRate
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(usd)
    }
    return amount.toLocaleString('vi-VN') + ' \u20ab'
}

function formatUSDDirect(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

export default function FinanceDashboardClient({ data }: { data: FinanceData }) {
    const [mode, setMode] = useState<FinanceMode>('team')
    const [currency, setCurrency] = useState<CurrencyMode>('VND')

    const isTeam = mode === 'team'
    const isUSD = currency === 'USD'
    const rate = data.exchangeRate

    const fmt = (vnd: number) => formatCurrency(vnd, currency, rate)
    const fmtUsd = (usd: number) => isUSD ? formatUSDDirect(usd) : (usd * rate).toLocaleString('vi-VN') + ' \u20ab'

    return (
        <div className="max-w-[1200px] mx-auto p-4 space-y-8">

            {/* PAGE HEADER */}
            <div className="flex flex-col gap-3">
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </span>
                    {isTeam ? 'Báo Cáo Tài Chính' : 'Thu Nhập Cá Nhân'}
                </h2>

                {/* TOGGLE CONTROLS */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Stats badges */}
                    <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {data.completedCount} completed
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-3 py-1 rounded-full text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {data.allTasksCount} total ({data.pendingCount} pending)
                    </span>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Currency Toggle */}
                    <div className="flex items-center bg-zinc-900/80 border border-white/10 rounded-xl p-0.5">
                        <button
                            onClick={() => setCurrency('VND')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                !isUSD ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            VNĐ
                        </button>
                        <button
                            onClick={() => setCurrency('USD')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                isUSD ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            USD
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex items-center bg-zinc-900/80 border border-white/10 rounded-xl p-0.5">
                        <button
                            onClick={() => setMode('team')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                                isTeam ? 'bg-indigo-500/20 text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            Team
                        </button>
                        <button
                            onClick={() => setMode('personal')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                                !isTeam ? 'bg-purple-500/20 text-purple-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            Personal
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════
                ROW 1: ACTUAL
            ══════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                        {isTeam ? 'THỰC TẾ — ĐÃ HOÀN THÀNH' : 'THU NHẬP THỰC TẾ'}
                    </span>
                    <div className="flex-1 h-px bg-emerald-500/10" />
                </div>
                <div className={`grid grid-cols-1 ${isTeam ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-4`}>

                    {/* Revenue */}
                    <div className="bg-zinc-950/50 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-blue-500/40 transition-all">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
                        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                            {isTeam ? 'TỔNG DOANH THU' : 'TỔNG THU NHẬP'}
                        </p>
                        <p className="text-xs text-zinc-600 mb-3">
                            {isTeam ? `Gross Revenue từ ${data.completedCount} task` : `Từ ${data.completedCount} task hoàn thành`}
                        </p>
                        <div className="text-2xl font-bold text-blue-400 font-mono tabular-nums">
                            {fmt(data.totalRevenueVND)}
                        </div>
                    </div>

                    {/* Cost - Team only */}
                    {isTeam && (
                        <div className="bg-zinc-950/50 border border-red-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-red-500/40 transition-all">
                            <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl" />
                            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">TỔNG CHI PHÍ</p>
                            <p className="text-xs text-zinc-600 mb-3">Wages đã chi trả cho nhân viên</p>
                            <div className="text-2xl font-bold text-red-400 font-mono tabular-nums">
                                {fmt(data.totalWageVND)}
                            </div>
                        </div>
                    )}

                    {/* Net Profit - Team only */}
                    {isTeam && (
                        <div className="bg-zinc-950/50 border border-emerald-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/40 transition-all shadow-[0_0_30px_rgba(16,185,129,0.05)]">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
                            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">LỢI NHUẬN RÒNG</p>
                            <div className={`text-xs font-bold mb-3 ${data.profitMargin > 50 ? 'text-emerald-400' : data.profitMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                                Margin: {data.profitMargin.toFixed(1)}%
                            </div>
                            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">
                                {fmt(data.netProfit)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════
                ROW 2: PROJECTED
            ══════════════════════════════════ */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                        {isTeam
                            ? `DỰ KIẾN — TOÀN BỘ ${data.allTasksCount} TASK`
                            : `DỰ KIẾN — ${data.allTasksCount} TASK`}
                    </span>
                    <div className="flex-1 h-px bg-indigo-500/10" />
                </div>
                <div className={`grid grid-cols-1 ${isTeam ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-4`}>

                    {/* Projected Revenue */}
                    <div className="bg-zinc-900/30 border border-dashed border-indigo-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                        <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                            {isTeam ? 'DỰ KIẾN DOANH THU' : 'DỰ KIẾN THU NHẬP'}
                        </p>
                        <p className="text-xs text-zinc-700 mb-3">+{fmt(data.projectedRevenueVND - data.totalRevenueVND)} pending</p>
                        <div className="text-2xl font-bold text-indigo-400/80 font-mono tabular-nums">
                            {fmt(data.projectedRevenueVND)}
                        </div>
                    </div>

                    {/* Projected Cost - Team only */}
                    {isTeam && (
                        <div className="bg-zinc-900/30 border border-dashed border-rose-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-rose-500/40 transition-all">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">DỰ KIẾN CHI PHÍ</p>
                            <p className="text-xs text-zinc-700 mb-3">+{fmt(data.projectedWageVND - data.totalWageVND)} to pay</p>
                            <div className="text-2xl font-bold text-rose-400/80 font-mono tabular-nums">
                                {fmt(data.projectedWageVND)}
                            </div>
                        </div>
                    )}

                    {/* Projected Net - Team only */}
                    {isTeam && (
                        <div className="bg-zinc-900/30 border border-dashed border-teal-500/20 rounded-2xl p-5 relative overflow-hidden group hover:border-teal-500/40 transition-all">
                            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">DỰ KIẾN LỢI NHUẬN</p>
                            <div className={`text-xs font-bold mb-3 opacity-70 ${data.projectedMargin > 50 ? 'text-emerald-400' : data.projectedMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                                Margin: {data.projectedMargin.toFixed(1)}%
                            </div>
                            <div className="text-2xl font-bold text-teal-400/80 font-mono tabular-nums">
                                {fmt(data.projectedNetProfit)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════
                SUMMARY BANNER - Team only
            ══════════════════════════════════ */}
            {isTeam && (
                <div className="bg-gradient-to-r from-indigo-500/8 via-zinc-900/20 to-emerald-500/8 border border-white/5 rounded-2xl p-5 flex items-center gap-4 flex-wrap shadow-inner">
                    <div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total Revenue</p>
                        <p className="text-lg font-bold text-indigo-300 font-mono tabular-nums">{fmt(data.projectedRevenueVND)}</p>
                    </div>
                    <div className="text-zinc-600 text-xl font-light px-2">{'\u2212'}</div>
                    <div>
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Total Cost</p>
                        <p className="text-lg font-bold text-rose-300 font-mono tabular-nums">{fmt(data.projectedWageVND)}</p>
                    </div>
                    <div className="text-zinc-600 text-xl font-light px-2">=</div>
                    <div>
                        <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-1">Net Profit</p>
                        <p className="text-lg font-bold text-teal-300 font-mono tabular-nums">{fmt(data.projectedNetProfit)}</p>
                    </div>
                    <div className="ml-auto text-right pl-4 border-l border-white/5">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Margin</p>
                        <p className={`text-3xl font-black tabular-nums ${data.projectedMargin > 50 ? 'text-emerald-400' : data.projectedMargin < 30 ? 'text-red-400' : 'text-yellow-400'}`}>
                            {data.projectedMargin.toFixed(1)}%
                        </p>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════
                TRANSACTION LOG
            ══════════════════════════════════ */}
            <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                        {isTeam ? 'Transaction Log' : 'My Earnings'}
                    </h3>
                    <span className="text-[11px] text-zinc-600 bg-zinc-900/50 px-2.5 py-1 rounded-lg border border-white/5">
                        {currency === 'USD' ? 'Showing in USD' : 'Showing in VND'}
                    </span>
                </div>

                {/* Column Headers */}
                <div className={`grid ${isTeam ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr]'} gap-0 px-6 py-2.5 border-b border-white/5 bg-zinc-900/20`}>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Task & Status</p>
                    {isTeam && <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Assignee</p>}
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">Revenue</p>
                    {isTeam && <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">Wage</p>}
                    {isTeam && <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-right">Net Profit</p>}
                </div>

                {/* Rows */}
                <div className="divide-y divide-white/[0.04]">
                    {data.transactions.slice(0, 50).map(t => (
                        <div key={t.id}
                            className={`grid ${isTeam ? 'grid-cols-[2fr_1fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr]'} gap-0 px-6 py-3.5 items-center transition-colors hover:bg-white/[0.02] ${!t.isCompleted ? 'opacity-60' : ''}`}
                        >
                            <div className="pr-4">
                                <p className={`text-sm font-medium ${t.isCompleted ? 'text-zinc-200' : 'text-zinc-400'} mb-1.5 truncate`}>{t.title}</p>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                        t.isCompleted
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                    }`}>
                                        {t.isCompleted ? 'DONE' : 'PENDING'}
                                    </span>
                                    <span className="text-[10px] text-zinc-700">{t.status}</span>
                                </div>
                            </div>

                            {isTeam && (
                                <p className="text-sm text-zinc-500">{t.assignee}</p>
                            )}

                            <p className="text-sm font-mono tabular-nums text-zinc-300 text-right font-medium">
                                {isUSD ? formatUSDDirect(t.jobPriceUSD) : fmt(t.revenueVND)}
                            </p>

                            {isTeam && (
                                <p className={`text-sm font-mono tabular-nums text-right font-medium ${t.isCompleted ? 'text-red-400' : 'text-rose-400/60'}`}>
                                    {fmt(t.wageVND)}
                                </p>
                            )}

                            {isTeam && (
                                <p className={`text-sm font-mono tabular-nums text-right font-bold ${t.isCompleted ? 'text-emerald-400' : 'text-teal-400/60'}`}>
                                    {fmt(t.netProfitVND)}
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {data.transactions.length === 0 && (
                    <div className="py-16 text-center text-zinc-600">
                        <p className="text-sm">No transaction data yet.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
