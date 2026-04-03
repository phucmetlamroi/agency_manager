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
    "Nh\u1eadn task": "bg-blue-500/10 text-blue-500 border-blue-500/20",
    "\u0110ang \u0111\u1ee3i giao": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "\u0110ang th\u1ef1c hi\u1ec7n": "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    "Revision": "bg-red-500/10 text-red-500 border-red-500/20",
    "Ho\u00e0n táº¥t": "bg-green-500/10 text-green-500 border-green-500/20",
    "T\u1ea1m ng\u01b0ng": "bg-gray-500/10 text-gray-500 border-gray-500/20",
    "S\u1eeda frame": "bg-pink-500/10 text-pink-500 border-pink-500/20",
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
            toast.success(`Status updated to ${newStatus}`)
            router.refresh()
        } catch (error) {
            toast.error("Failed to update status")
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
            toast.success("Sent revision feedback")
            router.refresh()
        } catch (error) {
            toast.error("Failed to submit feedback")
        }
    }

    // USER VIEW
    if (!isAdmin) {
        if (task.status === 'Nh\u1eadn task') {
            return (
                <Button
                    size="sm"
                    className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold h-8 px-4 shadow-lg shadow-yellow-500/20 ring-1 ring-yellow-400/50 transition-all hover:scale-105"
                    onClick={() => handleStatusChange('\u0110ang th\u1ef1c hi\u1ec7n')}
                >
                    {"\u25b6 B\u1eaft \u0111\u1ea7u"}
                </Button>
            )
        }
        if (task.status === '\u0110ang th\u1ef1c hi\u1ec7n') {
            return (
                <Badge variant="outline" className={`${statusColors['\u0110ang th\u1ef1c hi\u1ec7n']} gap-2`}>
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
                        {["\u0110ang \u0111\u1ee3i giao", "Nh\u1eadn task", "\u0110ang th\u1ef1c hi\u1ec7n", "Revision", "S\u1eeda frame", "T\u1ea1m ng\u1eebng", "Ho\u00e0n táº¥t"].map(opt => (
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
                        onClick={() => handleStatusChange('\u0110ang th\u1ef1c hi\u1ec7n')}
                    >
                        ✔
                    </Button>
                )}
            </div>

            <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-500">{"Ph\u00e2n lo\u1ea1i Revision"}</DialogTitle>
                        <DialogDescription>
                            {"Vui l\u00f2ng ch\u1ecdn ngu\u1ed3n y\u00eau c\u1ea7u s\u1eeda \u0111\u1ed5i \u0111\u1ec3 t\u00ednh \u0111i\u1ec3m KPI."}
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
                            <Label>Ghi ch\u00fa (Optional)</Label>
                            <textarea
                                value={feedback.content}
                                onChange={(e) => setFeedback({ ...feedback, content: e.target.value })}
                                placeholder="Chi ti\u1ebft l\u1ed7i..."
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
