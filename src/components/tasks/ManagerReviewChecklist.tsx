'use client'

import { useState, useEffect, useTransition } from 'react'
import { getErrorDictionary, submitManagerReview } from '@/actions/review-actions'
import { toast } from 'sonner'

export default function ManagerReviewChecklist({ taskId, workspaceId, onClose, onSuccess }: { taskId: string, workspaceId: string, onClose: () => void, onSuccess: () => void }) {
    const [dictionary, setDictionary] = useState<any[]>([])
    const [counts, setCounts] = useState<Record<string, number>>({})
    const [notes, setNotes] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        getErrorDictionary(workspaceId).then((data) => {
            setDictionary(data)
            setIsLoading(false)
        })
    }, [workspaceId])

    const handleIncrement = (id: string) => {
        setCounts(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }))
    }

    const handleDecrement = (id: string) => {
        setCounts(prev => {
            const current = prev[id] || 0
            if (current <= 0) return prev
            return { ...prev, [id]: current - 1 }
        })
    }

    const handleSubmit = () => {
        const payload = Object.entries(counts)
            .filter(([_, count]) => count > 0)
            .map(([errorId, count]) => ({ errorId, count }))

        if (payload.length === 0 && !notes) {
            toast.error('Vui lòng chọn ít nhất 1 lỗi hoặc ghi chú Feedback!')
            return
        }

        startTransition(async () => {
            const res = await submitManagerReview(taskId, workspaceId, payload, notes)
            if (res.success) {
                toast.success('Đã gửi Revision và ghi nhận lỗi!')
                onSuccess()
            } else {
                toast.error(res.error || 'Failed to submit revision')
            }
        })
    }

    return (
        <div 
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[10000] p-4"
            onClick={onClose}
        >
            <div 
                className="bg-[#121214] text-white w-full max-w-[600px] rounded-[20px] p-6 border border-zinc-800 flex flex-col max-h-[90dvh] overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
            >

                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold title-gradient">Đánh Giá & Bắt Lỗi (Review)</h3>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 font-bold text-zinc-400">×</button>
                </div>
                <p className="text-sm text-zinc-400 mb-6">Manager tick chọn các lỗi mà Editor vi phạm. Hệ thống sẽ tự động trừ điểm và phân rank vào cuối tháng.</p>

                {isLoading ? (
                    <div className="py-8 text-center text-zinc-500 animate-pulse">Đang tải từ điển lỗi...</div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                        {dictionary.map(err => {
                            const count = counts[err.id] || 0
                            const isSelected = count > 0

                            return (
                                <div key={err.id} className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${isSelected ? 'bg-red-500/10 border-red-500/30' : 'bg-black/40 border-zinc-800'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs px-2 py-0.5 rounded font-bold ${err.severity === 1 ? 'bg-red-500/20 text-red-500' : err.severity === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                                {err.code}
                                            </span>
                                            <span className="text-xs text-zinc-500 font-mono">-{err.penalty}đ</span>
                                        </div>
                                        <p className={`text-sm ${isSelected ? 'text-zinc-200' : 'text-zinc-500'}`}>{err.description}</p>
                                    </div>

                                    {/* Counter */}
                                    <div className="flex items-center gap-3 shrink-0 bg-black/60 rounded-lg p-1 border border-zinc-800">
                                        <button 
                                            onClick={() => handleDecrement(err.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-400 font-bold"
                                        >-</button>
                                        <span className={`w-4 text-center font-bold font-mono ${isSelected ? 'text-red-400' : 'text-zinc-500'}`}>
                                            {count}
                                        </span>
                                        <button 
                                            onClick={() => handleIncrement(err.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-800 text-zinc-400 font-bold"
                                        >+</button>
                                    </div>
                                </div>
                            )
                        })}
                        </div>
                    )}

                <div className="mt-6 space-y-2 flex-shrink-0">
                    <label className="text-sm font-semibold text-zinc-300">Ghi chú sửa đổi bổ sung (Sẽ được nối vào Task Notes)</label>
                    <textarea 
                        className="w-full bg-black/50 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-red-500/50"
                        rows={3}
                        placeholder="Có thể dán link tài liệu mới hoặc nhắc nhở chi tiết..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>

                <div className="mt-6 flex justify-end gap-3 flex-shrink-0">
                    <button disabled={isPending} onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-zinc-800 hover:bg-zinc-700 text-white transition-colors">
                        Hủy Bỏ
                    </button>
                    <button disabled={isPending || isLoading} onClick={handleSubmit} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 text-white transition-colors shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                        {isPending ? 'Đang ghi nhận...' : 'Phạt & Yêu cầu làm lại (Revision)'}
                    </button>
                </div>

            </div>
        </div>
    )
}
