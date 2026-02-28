'use client'

import { useState } from 'react'
import { archiveTasksAction } from '@/actions/archive-actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, ArchiveRestore } from 'lucide-react'

export default function ArchiveManager() {
    const [month, setMonth] = useState(new Date().getMonth()) // Default to previous month
    const [year, setYear] = useState(new Date().getFullYear())
    const [isLoading, setIsLoading] = useState(false)

    // Handle month wrap-around for default state
    const defaultMonth = new Date().getMonth() === 0 ? 12 : new Date().getMonth()
    const defaultYear = new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()

    // Using default state
    useState(() => {
        setMonth(defaultMonth)
        setYear(defaultYear)
    })

    const handleArchive = async () => {
        if (!confirm(`Bạn có chắc chắn muốn LƯU TRỮ (Archive) tất cả các task ĐÃ HOÀN THÀNH trong tháng ${month}/${year} không?\n\nChú ý: Các task này sẽ biến mất khỏi màn hình Dashboard chính nhưng vẫn luôn lưu trong lịch sử hệ thống.`)) {
            return
        }

        setIsLoading(true)
        try {
            const res = await archiveTasksAction(month, year)
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success(res.message)
            }
        } catch (error) {
            toast.error("An error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="glass-panel p-6 border border-zinc-800 rounded-xl mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
                <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                    <ArchiveRestore className="w-5 h-5 text-indigo-400" />
                    Lưu trữ dữ liệu cũ (Archive)
                </h2>
                <p className="text-sm text-zinc-400">
                    Dọn dẹp các task đã Hoàn thành trong tháng cũ để tăng tốc độ tải trang cho tháng mới.
                </p>
            </div>

            <div className="flex items-center gap-3 bg-zinc-900 p-2 rounded-lg border border-zinc-800">
                <select
                    value={month}
                    onChange={e => setMonth(Number(e.target.value))}
                    className="bg-zinc-800 border-none text-white text-sm rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
                >
                    {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                    ))}
                </select>
                <select
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    className="bg-zinc-800 border-none text-white text-sm rounded px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-500"
                >
                    {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>Năm {y}</option>
                    ))}
                </select>
                <Button
                    onClick={handleArchive}
                    disabled={isLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow shadow-indigo-500/20"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArchiveRestore className="w-4 h-4 mr-2" />}
                    Chạy Lưu Trữ
                </Button>
            </div>
        </div>
    )
}
