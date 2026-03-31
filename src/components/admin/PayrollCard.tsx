'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import PaymentModal from './PaymentModal'
import { CheckCircle2, CircleDashed, RotateCcw, TrendingUp, Clock, Trophy, Banknote, ChevronDown, ChevronUp } from 'lucide-react'
import { revertPayment } from '@/actions/payroll-actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

type PayrollCardProps = {
    user: any
    currentMonth: number
    currentYear: number
    workspaceId: string
    startOfMonth: Date
    endOfMonth: Date
}

export default function PayrollCard({ user, currentMonth, currentYear, workspaceId, startOfMonth, endOfMonth }: PayrollCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [showPending, setShowPending] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    // ── Logic (unchanged) ──────────────────────────────────────
    const completedTasks = user.tasks.filter((t: any) =>
        t.status === 'Hoàn tất' &&
        new Date(t.updatedAt) >= startOfMonth &&
        new Date(t.updatedAt) <= endOfMonth
    )
    const taskIncome = completedTasks.reduce((sum: number, task: any) => sum + task.value, 0)

    const pendingTasks = user.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const pendingIncome = pendingTasks.reduce((sum: number, task: any) => sum + task.value, 0)

    const bonusData = user.bonuses?.[0]
    const bonusAmount = bonusData ? bonusData.bonusAmount : 0
    const totalIncome = taskIncome + bonusAmount

    const payrollRecord = user.payrolls?.[0]
    const isPaid = payrollRecord?.status === 'PAID'

    const rankColors: Record<number, { gradient: string; border: string; badge: string; glow: string }> = {
        1: { gradient: 'from-yellow-500/20 to-amber-500/5', border: 'border-yellow-500/40', badge: 'bg-yellow-500 text-black', glow: 'shadow-yellow-500/20' },
        2: { gradient: 'from-zinc-400/20 to-zinc-500/5', border: 'border-zinc-400/40', badge: 'bg-zinc-400 text-black', glow: 'shadow-zinc-400/20' },
        3: { gradient: 'from-amber-700/20 to-amber-800/5', border: 'border-amber-700/40', badge: 'bg-amber-700 text-white', glow: 'shadow-amber-700/20' },
    }

    const rankEmoji = bonusData?.rank === 1 ? '🥇' : bonusData?.rank === 2 ? '🥈' : bonusData?.rank === 3 ? '🥉' : ''
    const rankStyle = bonusData?.rank ? rankColors[bonusData.rank] : null

    const handleRevert = () => {
        if (!confirm('Bạn có chắc chắn muốn hoàn tác (hủy) trạng thái thanh toán này?')) return
        startTransition(async () => {
            const res = await revertPayment(user.id, currentMonth, currentYear, workspaceId)
            if (res.error) { toast.error(res.error) }
            else { toast.success('Đã hủy trạng thái thanh toán') }
        })
    }

    // ── Sparkline (mini bar chart from task lengths) ──────────
    const maxIncome = Math.max(taskIncome, pendingIncome, 1)
    const completedPct = Math.round((taskIncome / maxIncome) * 100)
    const pendingPct = Math.round((pendingIncome / maxIncome) * 100)

    return (
        <div className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${rankStyle ? `bg-gradient-to-br ${rankStyle.gradient} ${rankStyle.border} shadow-xl ${rankStyle.glow}` : 'bg-zinc-950/60 border-white/10 shadow-xl shadow-black/40'} backdrop-blur-md`}>

            {/* Payment Modal */}
            {typeof window !== 'undefined' && isModalOpen && createPortal(
                <PaymentModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    user={user}
                    payrollData={{ month: currentMonth, year: currentYear, totalAmount: totalIncome, baseSalary: taskIncome, bonus: bonusAmount }}
                    workspaceId={workspaceId}
                />,
                document.body
            )}

            {/* Rank Badge (Top 1/2/3) */}
            {bonusData && rankStyle && (
                <div className={`absolute top-0 right-6 px-4 py-1 rounded-b-xl ${rankStyle.badge} font-black text-xs shadow-lg flex items-center gap-1.5 z-10`}>
                    <Trophy className="w-3.5 h-3.5" />
                    {rankEmoji} Top {bonusData.rank}
                </div>
            )}

            {/* ── Card Header ─────────────────────────────────── */}
            <div className="p-5 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">

                    {/* Left: User Identity */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/30">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            {isPaid && (
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-zinc-950 flex items-center justify-center">
                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-zinc-100 leading-tight">{user.nickname || user.username}</h3>
                            <span className="text-xs text-zinc-500 font-mono">ID: {user.id.slice(0, 8)}…</span>
                        </div>
                    </div>

                    {/* Right: Numbers + CTA */}
                    <div className="flex items-center gap-4 md:gap-8 flex-wrap">

                        {/* Pending (projected) */}
                        <div className="text-center md:text-right">
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-1 justify-center md:justify-end">
                                <Clock className="w-3 h-3" /> Dự kiến
                            </div>
                            <div className="text-xl font-bold text-indigo-400/80 tabular-nums">
                                {pendingIncome.toLocaleString()} đ
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block w-px h-10 bg-white/10" />

                        {/* Actual earned */}
                        <div className="text-center md:text-right">
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-1 justify-center md:justify-end">
                                <Banknote className="w-3 h-3" /> Thực nhận
                            </div>
                            <div className="text-2xl font-black text-emerald-400 tabular-nums drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]">
                                {totalIncome.toLocaleString()} đ
                            </div>
                        </div>

                        {/* Payment CTA */}
                        {isPaid ? (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/30 text-sm shadow-inner">
                                    <CheckCircle2 className="w-4 h-4" />
                                    ĐÃ THANH TOÁN
                                </div>
                                <Button variant="ghost" size="icon" onClick={handleRevert} disabled={isPending}
                                    className="h-9 w-9 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                                    title="Hoàn tác thanh toán">
                                    <RotateCcw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        ) : (
                            <button onClick={() => setIsModalOpen(true)}
                                className="bg-gradient-to-r from-indigo-600 to-blue-500 hover:brightness-110 text-white font-bold py-2.5 px-5 rounded-xl text-sm shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all duration-200 active:scale-95">
                                <CircleDashed className="w-4 h-4" />
                                Thanh toán
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Mini Sparkline ─────────────────────────────── */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <div>
                        <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-400" /> Đã hoàn tất</span>
                            <span className="font-mono text-zinc-400">{completedTasks.length} task</span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                                style={{ width: `${completedPct}%` }} />
                        </div>
                        <div className="text-right text-[10px] text-emerald-400/70 font-mono mt-1">{taskIncome.toLocaleString()} đ</div>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-indigo-400" /> Đang xử lý</span>
                            <span className="font-mono text-zinc-400">{pendingTasks.length} task</span>
                        </div>
                        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-700 to-indigo-400 transition-all duration-500 shadow-[0_0_6px_rgba(99,102,241,0.4)]"
                                style={{ width: `${pendingPct}%` }} />
                        </div>
                        <div className="text-right text-[10px] text-indigo-400/70 font-mono mt-1">{pendingIncome.toLocaleString()} đ</div>
                    </div>
                </div>
            </div>

            {/* ── Expand / Collapse Toggle ────────────────────── */}
            <div className="border-t border-white/5">
                <div className="flex items-center gap-3 px-5 md:px-6 py-2">
                    <button
                        onClick={() => setShowPending(false)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 ${!showPending ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
                    >
                        Hoàn tất ({completedTasks.length})
                    </button>
                    <button
                        onClick={() => setShowPending(true)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 ${showPending ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'}`}
                    >
                        Dự kiến ({pendingTasks.length})
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="ml-auto text-zinc-600 hover:text-zinc-300 transition-colors"
                        title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                {/* Expandable Task Table */}
                {isExpanded && (
                    <div className="px-5 md:px-6 pb-5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10 text-zinc-500 text-xs">
                                    <th className="py-2 px-2 text-left font-medium">Hạng Mục</th>
                                    <th className="py-2 px-2 text-right font-medium">Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(showPending ? pendingTasks : completedTasks).map((task: any) => (
                                    <tr key={task.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                        <td className="py-2.5 px-2">
                                            <div className="font-medium text-zinc-300 flex items-center gap-2 flex-wrap">
                                                {task.title}
                                                {showPending && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                        {task.status}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-zinc-600 mt-0.5">
                                                {new Date(task.updatedAt).toLocaleDateString('vi-VN')}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2 text-right font-mono text-zinc-300">
                                            {task.value.toLocaleString()} đ
                                        </td>
                                    </tr>
                                ))}

                                {/* Bonus Row */}
                                {bonusData && !showPending && (
                                    <tr className="bg-amber-500/5">
                                        <td className="py-2.5 px-2">
                                            <div className="font-bold text-amber-400 flex items-center gap-2">
                                                <Trophy className="w-3.5 h-3.5" />
                                                {rankEmoji} Thưởng Top {bonusData.rank} Doanh Thu
                                            </div>
                                            <div className="text-[11px] text-amber-500/70 mt-0.5">
                                                Doanh thu: {bonusData.revenue.toLocaleString()}đ • Tổng giờ: {bonusData.executionTimeHours.toFixed(1)}h
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                                            +{bonusData.bonusAmount.toLocaleString()} đ
                                        </td>
                                    </tr>
                                )}

                                {/* Total Row */}
                                <tr className="bg-emerald-500/5 border-t-2 border-white/10">
                                    <td className="py-3 px-2 text-right text-zinc-400 font-semibold">Tổng cộng:</td>
                                    <td className="py-3 px-2 text-right font-black text-emerald-400 text-lg font-mono">
                                        {totalIncome.toLocaleString()} đ
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
