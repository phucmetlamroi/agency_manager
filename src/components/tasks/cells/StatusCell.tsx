"use client"

import { useState } from "react"
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
    "Đã nhận task": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "Đang đợi giao": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "Đang thực hiện": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    "Revision": "bg-red-500/10 text-red-500 border-red-500/20",
    "Hoàn tất": "bg-green-500/10 text-green-500 border-green-500/20",
    "Tạm ngưng": "bg-gray-500/10 text-gray-500 border-gray-500/20",
    "Sửa frame": "bg-pink-500/10 text-pink-500 border-pink-500/20",
}

interface StatusCellProps {
    task: TaskWithUser
    isAdmin: boolean
}

export function StatusCell({ task, isAdmin }: StatusCellProps) {
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [feedback, setFeedback] = useState({ type: 'INTERNAL' as 'INTERNAL' | 'CLIENT', content: '' })

    const handleStatusChange = async (newStatus: string) => {
        if (newStatus === 'Revision' && isAdmin) {
            setIsFeedbackOpen(true)
            return
        }

        try {
            await updateTaskStatus(task.id, newStatus)
            toast.success(`Status updated to ${newStatus}`)
            // window.location.reload() // Optimistic UI preferred, but reload ensures consistency
        } catch (error) {
            toast.error("Failed to update status")
        }
    }

    const submitFeedback = async () => {
        try {
            await updateTaskStatus(task.id, 'Revision', undefined, feedback)
            setIsFeedbackOpen(false)
            setFeedback({ type: 'INTERNAL', content: '' })
            toast.success("Sent revision feedback")
            window.location.reload()
        } catch (error) {
            toast.error("Failed to submit feedback")
        }
    }

    // USER VIEW
    if (!isAdmin) {
        if (task.status === 'Đã nhận task') {
            return (
                <Button
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold h-7 animate-pulse"
                    onClick={() => handleStatusChange('Đang thực hiện')}
                >
                    ▶ Bắt đầu
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
                    Working...
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
                        {["Đã nhận task", "Đang thực hiện", "Revision", "Sửa frame", "Tạm ngưng", "Hoàn tất"].map(opt => (
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
                        title="Mark as Feedbacked (Resume)"
                        onClick={() => handleStatusChange('Đang thực hiện')}
                    >
                        ✔
                    </Button>
                )}
            </div>

            <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-500">Phân loại Revision</DialogTitle>
                        <DialogDescription>
                            Vui lòng chọn nguồn yêu cầu sửa đổi để tính điểm KPI.
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
                                <span className="font-bold">👤 Client</span>
                            </label>
                            <label className={`flex-1 p-3 rounded border cursor-pointer flex items-center justify-center gap-2 ${feedback.type === 'INTERNAL' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-600' : 'border-gray-200'}`}>
                                <input
                                    type="radio"
                                    name="fbType"
                                    checked={feedback.type === 'INTERNAL'}
                                    onChange={() => setFeedback({ ...feedback, type: 'INTERNAL' })}
                                    className="hidden"
                                />
                                <span className="font-bold">🏢 Internal</span>
                            </label>
                        </div>

                        <div className="space-y-2">
                            <Label>Ghi chú (Optional)</Label>
                            <textarea
                                value={feedback.content}
                                onChange={(e) => setFeedback({ ...feedback, content: e.target.value })}
                                placeholder="Chi tiết lỗi..."
                                className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFeedbackOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={submitFeedback}>Submit Revision</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
