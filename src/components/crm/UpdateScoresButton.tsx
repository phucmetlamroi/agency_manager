'use client'

import { calculateAllClientScores } from '@/actions/crm-scoring'
import { useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'

export default function UpdateScoresButton() {
    const [isLoading, setIsLoading] = useState(false)

    const handleUpdate = async () => {
        setIsLoading(true)
        const toastId = toast.loading('Đang tính toán lại AI Score...')

        try {
            const res = await calculateAllClientScores()
            if (res.success) {
                toast.success(`Đã cập nhật điểm số cho ${res.count} khách hàng!`, { id: toastId })
            } else {
                toast.error(res.error, { id: toastId })
            }
        } catch (e) {
            toast.error('Có lỗi xảy ra', { id: toastId })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <button
            onClick={handleUpdate}
            disabled={isLoading}
            className="w-full mt-4 py-2 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-sm font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all"
        >
            <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Đang xử lý...' : 'Cập nhật AI Score ngay'}
        </button>
    )
}
