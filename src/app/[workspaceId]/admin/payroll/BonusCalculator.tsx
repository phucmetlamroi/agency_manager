'use client'

import { calculateMonthlyBonus, revertMonthlyBonus, getPayrollLockStatus } from '@/actions/bonus-actions'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'

export default function BonusCalculator({ workspaceId }: { workspaceId: string }) {
    const { confirm } = useConfirm()
    const [isLoading, setIsLoading] = useState(false)
    const [isLocked, setIsLocked] = useState(false)
    const router = useRouter()

    useEffect(() => {
        checkLockStatus()
    }, [workspaceId])

    const checkLockStatus = async () => {
        const status = await getPayrollLockStatus(workspaceId)
        setIsLocked(status.isLocked)
    }

    const handleCalculate = async () => {
        if (!(await confirm({
            title: 'Tính thưởng tháng này?',
            message: 'Bạn có chắc chắn muốn TÍNH THƯỞNG THÁNG NÀY?\n\nHệ thống sẽ chốt số liệu doanh thu tại thời điểm hiện tại và xếp hạng nhân viên.',
            confirmText: 'Tính ngay',
            cancelText: 'Hủy'
        }))) return

        setIsLoading(true)
        try {
            const res = await calculateMonthlyBonus(workspaceId)
            if (res.success) {
                toast.success(`Đã tính xong thưởng tháng ${res.month}/${res.year}! Top 1, 2, 3 đã được cập nhật thưởng. Kỳ lương ĐÃ KHÓA.`)
                setIsLocked(true)
                router.refresh()
            } else {
                toast.error('Lỗi: ' + res.error)
            }
        } catch (error) {
            console.error(error)
            toast.error('Có lỗi xảy ra khi tính thưởng.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleRevert = async () => {
        if (!(await confirm({
            title: 'Hoàn tác & Tính lại?',
            message: 'CẢNH BÁO: Hành động này sẽ XÓA toàn bộ thưởng đã tính và MỞ KHÓA kỳ lương.\n\nBạn có chắc chắn muốn làm lại từ đầu không?',
            type: 'danger',
            confirmText: 'Xóa & Tính lại',
            cancelText: 'Hủy'
        }))) return

        setIsLoading(true)
        try {
            const res = await revertMonthlyBonus(workspaceId)
            if (res.success) {
                toast.success(res.message)
                setIsLocked(false)
                router.refresh()
            } else {
                toast.error('Lỗi: ' + res.error)
            }
        } catch (error) {
            console.error(error)
            toast.error('Có lỗi xảy ra khi hoàn tác.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Status Badge */}
            <div style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                background: isLocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: isLocked ? '#f87171' : '#34d399',
                border: isLocked ? '1px solid #7f1d1d' : '1px solid #064e3b',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
                <span style={{ fontSize: '1.2rem' }}>{isLocked ? '🔒' : '🔓'}</span>
                {isLocked ? 'ĐÃ KHÓA SỔ' : 'ĐANG MỞ'}
            </div>

            {isLocked ? (
                <button
                    onClick={handleRevert}
                    disabled={isLoading}
                    className="btn glass-panel"
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.5)',
                        fontWeight: 'bold',
                        padding: '0.8rem 1.5rem',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    {isLoading ? 'Đang xử lý...' : '↩️ Hoàn tác & Tính lại'}
                </button>
            ) : (
                <button
                    onClick={handleCalculate}
                    disabled={isLoading}
                    className="btn glass-panel"
                    style={{
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white',
                        fontWeight: 'bold',
                        border: 'none',
                        padding: '0.8rem 1.5rem',
                        fontSize: '1rem',
                        boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    {isLoading ? 'Đang tính toán...' : '🏆 Tính Thưởng Tháng Này'}
                </button>
            )}
        </div>
    )
}
