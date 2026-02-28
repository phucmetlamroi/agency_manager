'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Lock, PlusCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { lockMonthAction } from '@/actions/admin-actions'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

export default function WorkspaceControls() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const [isLocking, setIsLocking] = React.useState(false)
    const [openDialog, setOpenDialog] = React.useState(false)

    // Current explicit month or default to actual month
    const currentMonthParam = searchParams.get('month')
    const now = new Date()
    let currentYear = now.getFullYear()
    let currentMonth = now.getMonth() + 1 // 1-12

    if (currentMonthParam && /^\d{4}-\d{2}$/.test(currentMonthParam)) {
        const parts = currentMonthParam.split('-')
        currentYear = parseInt(parts[0], 10)
        currentMonth = parseInt(parts[1], 10)
    }

    const currentLabel = `Tháng ${currentMonth}/${currentYear}`

    const handleLockMonth = async () => {
        setIsLocking(true)
        try {
            const result = await lockMonthAction(currentMonthParam || undefined)
            if (result.error) {
                toast.error('Không thể chốt tháng', { description: result.error })
            } else {
                toast.success('Chốt tháng thành công', { description: `Dữ liệu ${currentLabel} đã được đóng băng.` })
                setOpenDialog(false)
            }
        } catch (err) {
            toast.error('Lỗi hệ thống')
        } finally {
            setIsLocking(false)
        }
    }

    const handleNewWorkspace = () => {
        let nextMonth = currentMonth + 1
        let nextYear = currentYear
        if (nextMonth > 12) {
            nextMonth = 1
            nextYear++
        }
        const nextMonthString = `${nextYear}-${String(nextMonth).padStart(2, '0')}`

        const params = new URLSearchParams(searchParams.toString())
        params.set('month', nextMonthString)
        router.replace(`${pathname}?${params.toString()}`)
        toast.success(`Đã khởi tạo Không gian làm việc Tháng ${nextMonth}/${nextYear}`)
    }

    return (
        <div className="flex items-center gap-2">
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 gap-2 h-9 px-3">
                        <Lock className="w-4 h-4" />
                        <span className="hidden sm:inline">Chốt {currentLabel}</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="bg-zinc-900 border-orange-500/20">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-orange-400">
                            <AlertTriangle className="w-5 h-5" />
                            Xác nhận Chốt {currentLabel}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400 mt-2">
                            Bạn sắp đóng băng toàn bộ dữ liệu tài chính và đưa các task đã hoàn thành vào kho lưu trữ (Archive) của tháng này.
                            Hành động này <span className="text-red-400 font-bold">không thể hoàn tác</span> dễ dàng.
                            <br /><br />
                            Lưu ý: Nếu vẫn còn task đang làm dở (Chưa Hoàn Tất), hệ thống sẽ báo lỗi và từ chối khóa.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="ghost" onClick={() => setOpenDialog(false)}>Hủy</Button>
                        <Button variant="destructive" onClick={handleLockMonth} disabled={isLocking} className="bg-orange-600 hover:bg-orange-700 text-white">
                            {isLocking ? 'Đang xử lý...' : 'Xác nhận Chốt'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Button onClick={handleNewWorkspace} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-lg shadow-indigo-500/20 h-9 px-3">
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Tháng Mới</span>
            </Button>
        </div>
    )
}
