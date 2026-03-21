'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import PaymentModal from './PaymentModal'
import { CheckCircle2, CircleDashed, RotateCcw } from 'lucide-react'
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

    // 1. Calculate REAL income (ONLY completed in THIS month)
    const completedTasks = user.tasks.filter((t: any) => 
        t.status === 'Hoàn tất' && 
        new Date(t.updatedAt) >= startOfMonth && 
        new Date(t.updatedAt) <= endOfMonth
    )
    const taskIncome = completedTasks.reduce((sum: number, task: any) => sum + task.value, 0)
    
    // 2. Calculate PENDING income (Future money - based on user specifying statuses)
    const pendingTasks = user.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
    const pendingIncome = pendingTasks.reduce((sum: number, task: any) => sum + task.value, 0)

    const bonusData = user.bonuses?.[0]
    const bonusAmount = bonusData ? bonusData.bonusAmount : 0
    const totalIncome = taskIncome + bonusAmount

    // Check if PAID
    const payrollRecord = user.payrolls?.[0]
    const isPaid = payrollRecord?.status === 'PAID'

    const rankEmoji = bonusData?.rank === 1 ? '🥇' : bonusData?.rank === 2 ? '🥈' : bonusData?.rank === 3 ? '🥉' : ''

    const handleRevert = () => {
        if (!confirm('Bạn có chắc chắn muốn hoàn tác (hủy) trạng thái thanh toán này?')) return

        startTransition(async () => {
            const res = await revertPayment(user.id, currentMonth, currentYear, workspaceId)
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success('Đã hủy trạng thái thanh toán')
            }
        })
    }

    return (
        <div className="glass-panel" style={{ padding: '1.5rem', border: bonusData ? '1px solid #f59e0b' : '1px solid rgba(16, 185, 129, 0.2)', position: 'relative' }}>

            {/* Payment Modal - Rendered via Portal to avoid z-index issues */}
            {typeof window !== 'undefined' && isModalOpen && createPortal(
                <PaymentModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    user={user}
                    payrollData={{
                        month: currentMonth,
                        year: currentYear,
                        totalAmount: totalIncome,
                        baseSalary: taskIncome,
                        bonus: bonusAmount
                    }}
                    workspaceId={workspaceId}
                />,
                document.body
            )}

            {/* Rank Badge */}
            {bonusData && (
                <div style={{
                    position: 'absolute', top: '-10px', right: '20px',
                    background: '#f59e0b', color: 'black', fontWeight: 'bold',
                    padding: '5px 15px', borderRadius: '20px',
                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.4)',
                    display: 'flex', alignItems: 'center', gap: '5px'
                }}>
                    {rankEmoji} Top {bonusData.rank}
                </div>
            )}

            {/* User Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white'
                    }}>
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{user.nickname || user.username}</h3>
                        <span style={{ fontSize: '0.8rem', color: '#888' }}>ID: {user.id.slice(0, 8)}...</span>
                    </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '4px' }}>Lương dự kiến</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#6366f1', opacity: 0.8 }}>
                            {pendingIncome.toLocaleString()} đ
                        </div>
                    </div>
                    
                    <div>
                        <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '4px' }}>Tổng thực nhận</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>
                            {totalIncome.toLocaleString()} đ
                        </div>
                    </div>

                    {/* Payment Button / Status */}
                    {isPaid ? (
                        <div className="flex items-center gap-3 ml-auto justify-end">
                            <div className="flex items-center gap-2 text-green-400 font-bold bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                                <CheckCircle2 className="w-4 h-4" />
                                ĐÃ THANH TOÁN
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleRevert}
                                disabled={isPending}
                                className="h-8 w-8 text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                                title="Hoàn tác thanh toán (Reset)"
                            >
                                <RotateCcw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 text-white font-bold py-1.5 px-4 rounded-lg text-sm shadow-blue-500/20 shadow-lg flex items-center gap-2 ml-auto"
                        >
                            <CircleDashed className="w-4 h-4" />
                            Thanh toán ngay
                        </button>
                    )}
                </div>
            </div>
            {/* Quick Filter Tabs */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button 
                    onClick={() => setShowPending(false)}
                    style={{ 
                        fontSize: '0.8rem', padding: '4px 12px', borderRadius: '8px',
                        background: !showPending ? '#10b98122' : 'transparent',
                        color: !showPending ? '#10b981' : '#666',
                        border: !showPending ? '1px solid #10b98144' : '1px solid #333'
                    }}
                >
                    Đã hoàn tất ({completedTasks.length})
                </button>
                <button 
                    onClick={() => setShowPending(true)}
                    style={{ 
                        fontSize: '0.8rem', padding: '4px 12px', borderRadius: '8px',
                        background: showPending ? '#6366f122' : 'transparent',
                        color: showPending ? '#6366f1' : '#666',
                        border: showPending ? '1px solid #6366f144' : '1px solid #333'
                    }}
                >
                    Dự kiến ({pendingTasks.length})
                </button>
            </div>

            {/* Simple Task List Table */}
            <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500' }}>Hạng Mục</th>
                            <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500', textAlign: 'right' }}>Thành Tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(showPending ? pendingTasks : completedTasks).map((task: any) => (
                            <tr key={task.id} style={{ borderBottom: '1px solid #222', color: '#e5e5e5' }}>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                    <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        Task: {task.title}
                                        {showPending && (
                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: '#6366f122', color: '#818cf8', border: '1px solid #6366f133' }}>
                                                {task.status}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                        {new Date(task.updatedAt).toLocaleDateString()}
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', color: '#ccc' }}>
                                    {task.value.toLocaleString()} đ
                                </td>
                            </tr>
                        ))}

                        {/* Bonus Row */}
                        {bonusData && (
                            <tr style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                    <div style={{ fontWeight: 'bold', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {rankEmoji} Thưởng Top {bonusData.rank} Doanh Thu
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                                        (Doanh thu: {bonusData.revenue.toLocaleString()}đ • Tổng giờ: {bonusData.executionTimeHours.toFixed(1)}h)
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', color: '#f59e0b', fontWeight: 'bold' }}>
                                    +{bonusData.bonusAmount.toLocaleString()} đ
                                </td>
                            </tr>
                        )}

                        <tr style={{ background: 'rgba(16, 185, 129, 0.05)', borderTop: '2px solid #333' }}>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#ccc' }}>
                                Tổng cộng:
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981', fontSize: '1.2rem' }}>
                                {totalIncome.toLocaleString()} đ
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
