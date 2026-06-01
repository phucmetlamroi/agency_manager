'use client'

import { calculateMonthlyBonus, revertMonthlyBonus, getPayrollLockStatus } from '@/actions/bonus-actions'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Settings, Gift, RotateCcw, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import BonusConfigModal from '@/components/admin/BonusConfigModal'

export default function BonusCalculator({ workspaceId }: { workspaceId: string }) {
    const { confirm } = useConfirm()
    const [isLoading, setIsLoading] = useState(false)
    const [isLocked, setIsLocked] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
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
                const awardedCount = res.bonuses?.length || 0;
                const topText = awardedCount > 0 
                  ? `Đã thưởng cho Top ${awardedCount} nhân sự.` 
                  : 'Không có nhân sự nào đủ điều kiện thưởng.'

                toast.success(`Đã tính xong thưởng tháng ${res.month}/${res.year}! ${topText} Kỳ lương ĐÃ KHÓA.`)
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
        <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {/* Trạng thái kỳ lương — pill đồng bộ Dashboard */}
            {isLocked ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[20px] text-[13px] font-bold bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#F87171]">
                    <Lock className="w-3.5 h-3.5" />
                    ĐÃ KHÓA SỔ
                </div>
            ) : (
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[20px] text-[13px] font-bold bg-[#121016] border border-[rgba(139,92,246,0.1)] text-[#D8B4FE]">
                    <span className="w-2 h-2 rounded-full bg-[#8B5CF6] animate-pulse" />
                    ĐANG MỞ
                </div>
            )}

            {isLocked ? (
                <Button
                    onClick={handleRevert}
                    disabled={isLoading}
                    variant="ghost"
                    className="gap-2 font-bold rounded-xl border border-[rgba(239,68,68,0.4)] text-[#F87171] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#F87171]"
                >
                    <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    {isLoading ? 'Đang xử lý...' : 'Hoàn tác & Tính lại'}
                </Button>
            ) : (
                <Button
                    onClick={handleCalculate}
                    disabled={isLoading}
                    className="gap-2 font-bold rounded-xl shadow-lg shadow-violet-500/30"
                >
                    <Gift className="w-4 h-4" />
                    {isLoading ? 'Đang tính toán...' : 'Tính Thưởng Tháng Này'}
                </Button>
            )}

            {/* [Bonus Config] Nút cấu hình thưởng theo team (Top 1/2/3 + %) */}
            <Button
                type="button"
                onClick={() => setShowConfig(true)}
                variant="ghost"
                size="icon"
                title="Cấu hình thưởng (Top 1/2/3)"
                className="rounded-xl border border-[rgba(139,92,246,0.15)] text-[#A1A1AA] hover:bg-[rgba(139,92,246,0.1)] hover:text-[#D8B4FE]"
            >
                <Settings className="w-4 h-4" />
            </Button>

            {showConfig && <BonusConfigModal workspaceId={workspaceId} onClose={() => setShowConfig(false)} />}
        </div>
    )
}
