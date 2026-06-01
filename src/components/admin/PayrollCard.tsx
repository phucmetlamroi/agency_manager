'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PaymentModal from './PaymentModal'
import { CheckCircle2, RotateCcw, Trophy, Wallet, Hourglass, ChevronDown } from 'lucide-react'
import { revertPayment } from '@/actions/payroll-actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SALARY_PENDING_STATUSES } from '@/lib/task-statuses'

type PayrollCardProps = {
    user: any
    currentMonth: number
    currentYear: number
    workspaceId: string
}

const FONT = "'Plus Jakarta Sans', sans-serif"

export default function PayrollCard({ user, currentMonth, currentYear, workspaceId }: PayrollCardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [showPending, setShowPending] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    // ── Logic (UNCHANGED) ──────────────────────────────────────
    const completedTasks = user.tasks.filter((t: any) =>
        t.status === 'Hoàn tất'
    )
    const taskIncome = completedTasks.reduce((sum: number, task: any) => sum + task.value, 0)

    const pendingTasks = user.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const pendingIncome = pendingTasks.reduce((sum: number, task: any) => sum + task.value, 0)

    const bonusData = user.bonuses?.[0]
    const bonusAmount = bonusData ? bonusData.bonusAmount : 0
    const bonusPercent = bonusData ? Number(bonusData.bonusPercent ?? 0) : 0
    const totalIncome = taskIncome + bonusAmount

    const payrollRecord = user.payrolls?.[0]
    const isPaid = payrollRecord?.status === 'PAID'

    const rankEmoji = bonusData?.rank === 1 ? '🥇' : bonusData?.rank === 2 ? '🥈' : bonusData?.rank === 3 ? '🥉' : ''

    const handleRevert = () => {
        if (!confirm('Bạn có chắc chắn muốn hoàn tác (hủy) trạng thái thanh toán này?')) return
        startTransition(async () => {
            const res = await revertPayment(user.id, 0, 0, workspaceId)
            if (res.error) { toast.error(res.error) }
            else { toast.success('Đã hủy trạng thái thanh toán') }
        })
    }

    // ── Segmented progress theo SỐ task (done + proc) ──────────
    const totalTasksCount = completedTasks.length + pendingTasks.length
    const donePct = totalTasksCount > 0 ? (completedTasks.length / totalTasksCount) * 100 : 0
    const procPct = totalTasksCount > 0 ? (pendingTasks.length / totalTasksCount) * 100 : 0

    // Huy chương Top 1/2/3 — vàng/bạc/đồng (nổi bật) kèm glow + viền card
    const rankStyle: Record<number, { grad: string; glow: string; ring: string; text: string }> = {
        1: { grad: 'linear-gradient(135deg,#FFE08A,#F5A524)', glow: 'rgba(245,165,36,0.55)', ring: 'rgba(245,165,36,0.55)', text: '#3a2705' },
        2: { grad: 'linear-gradient(135deg,#EEF2F7,#A9B6C6)', glow: 'rgba(169,182,198,0.45)', ring: 'rgba(169,182,198,0.45)', text: '#22262b' },
        3: { grad: 'linear-gradient(135deg,#F0B584,#C26B3F)', glow: 'rgba(194,107,63,0.5)', ring: 'rgba(194,107,63,0.5)', text: '#2a1505' },
    }
    const rank: number | undefined = bonusData?.rank
    const rs = rank ? rankStyle[rank] : null

    const displayName = user.displayName?.trim() || user.username
    const detailTasks = showPending ? pendingTasks : completedTasks

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            whileHover={{ borderColor: rs ? rs.ring : 'rgba(139,92,246,0.25)', y: -2 }}
            className={`relative overflow-hidden rounded-[26px] transition-colors duration-150 ${isPaid ? 'opacity-70' : ''} ${totalIncome === 0 ? 'opacity-60' : ''}`}
            style={{
                backgroundColor: '#0A0A0A',
                border: `1px solid ${rs ? rs.ring : 'rgba(139,92,246,0.15)'}`,
                boxShadow: rs ? `0 0 28px ${rs.glow}` : undefined,
                fontFamily: FONT,
            }}
        >
            {/* Vạch accent trái — chưa thanh toán */}
            {!isPaid && (
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: '#8B5CF6' }} />
            )}

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

            {/* Rank badge (Top 1/2/3) — huy chương nổi bật */}
            {rank && rs && (
                <motion.div
                    initial={false}
                    animate={rank === 1 ? { scale: [1, 1.06, 1] } : undefined}
                    transition={rank === 1 ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
                    className="absolute top-0 right-5 px-4 py-1.5 rounded-b-2xl font-extrabold text-[13px] flex items-center gap-1.5 z-20"
                    style={{ background: rs.grad, color: rs.text, boxShadow: `0 6px 22px ${rs.glow}` }}
                >
                    <span className="text-[16px] leading-none">{rankEmoji}</span>
                    Top {rank}
                </motion.div>
            )}

            {/* ── Hàng chính ───────────────────────────────────── */}
            <div className="p-5 flex flex-col gap-4 md:flex-row md:items-center md:gap-6">

                {/* Định danh */}
                <div className="flex items-center gap-3.5 md:w-[220px] md:flex-shrink-0">
                    <div className="relative flex-shrink-0">
                        <div
                            className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg"
                            style={{ background: 'linear-gradient(135deg,#A855F7,#6366F1)' }}
                        >
                            {displayName.charAt(0).toUpperCase()}
                        </div>
                        {isPaid && (
                            <div
                                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center"
                                style={{ backgroundColor: '#8B5CF6', borderColor: '#0A0A0A' }}
                            >
                                <CheckCircle2 className="w-3 h-3 text-white" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-white leading-tight truncate">{displayName}</h3>
                        <span className="text-[11px] font-mono" style={{ color: '#52525B' }}>ID: {user.id.slice(0, 8)}…</span>
                    </div>
                </div>

                {/* Thanh tiến độ gộp */}
                <div className="flex-1 min-w-0">
                    <div
                        className="h-2.5 rounded-full overflow-hidden flex"
                        style={{ backgroundColor: '#211B31' }}
                        title={`${completedTasks.length} hoàn tất · ${pendingTasks.length} đang xử lý`}
                    >
                        <div className="h-full transition-[width] duration-500" style={{ width: `${donePct}%`, backgroundColor: '#8B5CF6' }} />
                        <div className="h-full transition-[width] duration-500" style={{ width: `${procPct}%`, backgroundColor: '#A855F7' }} />
                    </div>
                    <div className="flex items-center gap-3.5 mt-2 text-[11px]" style={{ color: '#A1A1AA' }}>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#8B5CF6' }} />
                            {completedTasks.length} hoàn tất
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#A855F7' }} />
                            {pendingTasks.length} đang xử lý
                        </span>
                    </div>
                </div>

                {/* Tiền + CTA */}
                <div className="flex items-center gap-5 md:gap-6 flex-wrap">
                    {/* Dự kiến */}
                    <div className="text-left md:text-right">
                        <div className="flex items-center gap-1.5 text-[11px] mb-1 md:justify-end" style={{ color: '#A1A1AA' }}>
                            <Hourglass className="w-3 h-3" /> Dự kiến
                        </div>
                        <div className="text-lg font-bold tabular-nums" style={{ color: pendingIncome > 0 ? '#D8B4FE' : '#52525B' }}>
                            {pendingIncome.toLocaleString()} đ
                        </div>
                    </div>

                    <div className="hidden md:block w-px h-10" style={{ backgroundColor: 'rgba(139,92,246,0.15)' }} />

                    {/* Thực nhận — hero */}
                    <div className="text-left md:text-right">
                        <div className="flex items-center gap-1.5 text-[11px] mb-1 md:justify-end" style={{ color: '#A1A1AA' }}>
                            <Wallet className="w-3 h-3" /> Thực nhận
                        </div>
                        <div className="text-2xl font-extrabold tabular-nums text-white drop-shadow-[0_0_10px_rgba(139,92,246,0.45)]">
                            {totalIncome.toLocaleString()} đ
                        </div>
                    </div>

                    {/* CTA */}
                    {isPaid ? (
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-[20px] text-[13px] font-bold bg-[rgba(139,92,246,0.12)] border border-[rgba(139,92,246,0.3)] text-[#D8B4FE]">
                                <CheckCircle2 className="w-4 h-4" />
                                Đã thanh toán
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRevert}
                                disabled={isPending}
                                className="h-9 w-9 rounded-xl text-[#71717A] hover:text-[#F87171] hover:bg-[rgba(239,68,68,0.1)]"
                                title="Hoàn tác thanh toán"
                            >
                                <RotateCcw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            onClick={() => setIsModalOpen(true)}
                            className="gap-2 font-bold rounded-xl shadow-lg shadow-violet-500/30 active:scale-95"
                        >
                            <Wallet className="w-4 h-4" />
                            Thanh toán
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Tabs + mở rộng ───────────────────────────────── */}
            <div className="border-t" style={{ borderColor: 'rgba(139,92,246,0.1)' }}>
                <div className="flex items-center gap-2 px-5 py-2.5">
                    <button
                        onClick={() => setShowPending(false)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 border ${!showPending ? 'bg-[rgba(139,92,246,0.15)] text-[#D8B4FE] border-[rgba(139,92,246,0.3)]' : 'text-[#71717A] hover:text-[#A1A1AA] border-transparent'}`}
                    >
                        Hoàn tất ({completedTasks.length})
                    </button>
                    <button
                        onClick={() => setShowPending(true)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 border ${showPending ? 'bg-[rgba(139,92,246,0.15)] text-[#D8B4FE] border-[rgba(139,92,246,0.3)]' : 'text-[#71717A] hover:text-[#A1A1AA] border-transparent'}`}
                    >
                        Dự kiến ({pendingTasks.length})
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="ml-auto p-1.5 rounded-lg text-[#71717A] hover:text-[#D8B4FE] hover:bg-[rgba(139,92,246,0.08)] transition-colors"
                        title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                    >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="overflow-hidden"
                        >
                            <div className="px-5 pb-5 pt-1">
                                <div className="rounded-2xl p-2" style={{ backgroundColor: '#121016', border: '1px solid rgba(139,92,246,0.08)' }}>
                                    {detailTasks.map((task: any, idx: number) => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, x: -6 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.03, duration: 0.2 }}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(139,92,246,0.05)] transition-colors"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-zinc-200 flex items-center gap-2 flex-wrap">
                                                    {task.title}
                                                    {showPending && (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-[rgba(139,92,246,0.1)] text-[#D8B4FE] border border-[rgba(139,92,246,0.2)] flex-shrink-0">
                                                            {task.status}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] mt-0.5" style={{ color: '#52525B' }}>
                                                    {new Date(task.updatedAt).toLocaleDateString('vi-VN')}
                                                </div>
                                            </div>
                                            <div className="font-mono text-sm text-zinc-300 tabular-nums flex-shrink-0">
                                                {task.value.toLocaleString()} đ
                                            </div>
                                        </motion.div>
                                    ))}

                                    {detailTasks.length === 0 && (
                                        <div className="text-center py-6 text-sm" style={{ color: '#52525B' }}>
                                            Không có task nào.
                                        </div>
                                    )}

                                    {/* Dòng thưởng */}
                                    {bonusData && !showPending && (
                                        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mt-1" style={{ backgroundColor: 'rgba(139,92,246,0.08)' }}>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-[#D8B4FE] flex items-center gap-2">
                                                    <Trophy className="w-3.5 h-3.5" />
                                                    {rankEmoji} Thưởng Top {bonusData.rank}{bonusPercent > 0 ? ` · ${bonusPercent}%` : ''}
                                                </div>
                                                <div className="text-[11px] mt-0.5" style={{ color: '#A1A1AA' }}>
                                                    {bonusPercent > 0
                                                        ? `${bonusPercent}% × Thực nhận ${Number(bonusData.revenue).toLocaleString()}đ`
                                                        : `Thực nhận: ${Number(bonusData.revenue).toLocaleString()}đ`}
                                                </div>
                                            </div>
                                            <div className="font-mono text-sm font-bold text-[#D8B4FE] tabular-nums flex-shrink-0">
                                                +{bonusData.bonusAmount.toLocaleString()} đ
                                            </div>
                                        </div>
                                    )}

                                    {/* Tổng cộng */}
                                    <div className="flex items-center justify-between px-3 py-3 mt-1 border-t" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>
                                        <span className="text-sm font-semibold" style={{ color: '#A1A1AA' }}>Tổng cộng</span>
                                        <span className="text-lg font-extrabold text-white font-mono tabular-nums drop-shadow-[0_0_10px_rgba(139,92,246,0.45)]">
                                            {totalIncome.toLocaleString()} đ
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}
