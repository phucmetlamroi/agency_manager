"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TaskWithUser } from "@/types/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { updateTaskStatus } from "@/actions/task-actions"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

const statusColors: Record<string, string> = {
    "Nhận task": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "Đang đợi giao": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "Đang thực hiện": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    // [Sprint A] 'Review' status đã bỏ — submit giờ đi thẳng Revision
    "Revision": "bg-red-500/10 text-red-500 border-red-500/20",
    "Gửi lại": "bg-orange-500/10 text-orange-500 border-orange-500/20",
    "Hoàn tất": "bg-green-500/10 text-green-500 border-green-500/20",
    "Tạm ngưng": "bg-gray-500/10 text-gray-500 border-gray-500/20",
    "Sửa frame": "bg-pink-500/10 text-pink-500 border-pink-500/20",
    // Bug fix: status="Quá hạn" set by cron when deadline passes — needed for visibility.
    "Quá hạn": "bg-red-600/15 text-red-600 border-red-600/30 font-bold",
    "Đã hủy": "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
    // [P3/F2] 6 video-lifecycle statuses (A2–A7).
    "Đã nộp video (nội bộ)": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    "Đang sửa feedback (nội bộ)": "bg-amber-500/10 text-amber-500 border-amber-500/20",
    "Đã sửa feedback (nội bộ)": "bg-teal-500/10 text-teal-400 border-teal-500/20",
    "Đã gửi video (khách)": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    "Đã nhận feedback (khách)": "bg-red-500/10 text-red-500 border-red-500/20",
    "Đã sửa feedback (khách)": "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

interface StatusCellProps {
    task: TaskWithUser
    isAdmin: boolean
    workspaceId: string
}

export function StatusCell({ task, isAdmin, workspaceId }: StatusCellProps) {

    const router = useRouter()
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [feedback, setFeedback] = useState({ type: 'INTERNAL' as 'INTERNAL' | 'CLIENT', content: '' })

    const handleStatusChange = async (newStatus: string) => {
        if (newStatus === 'Revision' && isAdmin) {
            setIsFeedbackOpen(true)
            return
        }

        try {
            const result = await updateTaskStatus(task.id, newStatus, workspaceId, undefined, undefined, task.version)
            if (result.error) {
                toast.error(result.error)
                return
            }
            toast.success(`Đã chuyển trạng thái sang ${newStatus}`)
            router.refresh()
        } catch (error) {
            toast.error("Cập nhật trạng thái thất bại")
        }
    }

    const submitFeedback = async () => {
        try {
            const result = await updateTaskStatus(task.id, 'Revision', workspaceId, undefined, feedback)
            if (result.error) {
                toast.error(result.error)
                return
            }
            setIsFeedbackOpen(false)
            setFeedback({ type: 'INTERNAL', content: '' })
            toast.success("Đã gửi phản hồi Revision")
            router.refresh()
        } catch (error) {
            toast.error("Gửi phản hồi thất bại")
        }
    }

    // USER VIEW
    if (!isAdmin) {
        if (task.status === 'Nhận task') {
            return (
                <Button
                    size="sm"
                    className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold h-8 px-4 shadow-lg shadow-yellow-500/20 ring-1 ring-yellow-400/50 transition-all hover:scale-105"
                    onClick={() => handleStatusChange('Đang thực hiện')}
                >
                    {"▶ Bắt đầu"}
                </Button>
            )
        }
        if (task.status === 'Đang thực hiện') {
            return (
                <Badge variant="outline" className={`${statusColors['Đang thực hiện']} gap-2`}>
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                    </span>
                    Đang làm...
                </Badge>
            )
        }
        return (
            <Badge variant="outline" className={statusColors[task.status] || "bg-secondary"}>
                {task.status}
            </Badge>
        )
    }

    // ADMIN VIEW
    return (
        <>
            <div className="flex items-center gap-2">
                <Select value={task.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className={`h-8 border-0 font-bold ${statusColors[task.status]}`}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {/* [Sprint A] 'Review' đã bỏ — submit → Revision */}
                        {/* [QA R1 fix] 'Tạm ngừng' (ừ) sai chính tả → 'Tạm ngưng' (ư) để khớp VALID_TASK_STATUSES; trước đây chọn Pause bị server từ chối, status không lưu. */}
                        {/* [P3/F2] video statuses (A2–A7) included so admin can see/correct
                            them by hand; normally they flip via the review module (F7–F10). */}
                        {["Đang đợi giao", "Nhận task", "Đang thực hiện", "Đã nộp video (nội bộ)", "Đang sửa feedback (nội bộ)", "Đã sửa feedback (nội bộ)", "Đã gửi video (khách)", "Đã nhận feedback (khách)", "Đã sửa feedback (khách)", "Revision", "Gửi lại", "Sửa frame", "Tạm ngưng", "Quá hạn", "Hoàn tất", "Đã hủy"].map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Admin Revision Controls */}
                {task.status === 'Revision' && (
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-50"
                        title="Đánh dấu đã phản hồi (Tiếp tục)"
                        onClick={() => handleStatusChange('Đang thực hiện')}
                    >
                        ✔
                    </Button>
                )}
            </div>

            <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-500">{"Phân loại Revision"}</DialogTitle>
                        <DialogDescription>
                            {"Vui lòng chọn nguồn yêu cầu sửa đổi để tính điểm KPI."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Custom Radio Group */}
                        <div className="flex gap-4">
                            <label className={`flex-1 p-3 rounded border cursor-pointer flex items-center justify-center gap-2 ${feedback.type === 'CLIENT' ? 'bg-red-500/10 border-red-500 text-red-500' : 'border-gray-200'}`}>
                                <input
                                    type="radio"
                                    name="fbType"
                                    checked={feedback.type === 'CLIENT'}
                                    onChange={() => setFeedback({ ...feedback, type: 'CLIENT' })}
                                    className="hidden"
                                />
                                <span className="font-bold">👤 Khách hàng</span>
                            </label>
                            <label className={`flex-1 p-3 rounded border cursor-pointer flex items-center justify-center gap-2 ${feedback.type === 'INTERNAL' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-600' : 'border-gray-200'}`}>
                                <input
                                    type="radio"
                                    name="fbType"
                                    checked={feedback.type === 'INTERNAL'}
                                    onChange={() => setFeedback({ ...feedback, type: 'INTERNAL' })}
                                    className="hidden"
                                />
                                <span className="font-bold">🏢 Nội bộ</span>
                            </label>
                        </div>

                        <div className="space-y-2">
                            <Label>Ghi chú (Không bắt buộc)</Label>
                            <textarea
                                value={feedback.content}
                                onChange={(e) => setFeedback({ ...feedback, content: e.target.value })}
                                placeholder="Chi tiết lỗi..."
                                className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFeedbackOpen(false)}>Huỷ</Button>
                        <Button variant="destructive" onClick={submitFeedback}>Gửi Revision</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
