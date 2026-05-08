"use client"

import { useState } from "react"
import { Drawer } from "vaul"
import { TaskWithUser } from "@/types/admin"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Calendar, Link as LinkIcon, User, Play, Pause, Send, CheckCircle2, AlertTriangle, Trash2, UserPlus, Users,
} from "lucide-react"
import DOMPurify from "isomorphic-dompurify"
import { ensureExternalLinks } from "@/lib/utils"
import { formatClientHierarchy } from "@/lib/client-hierarchy"
import { getValidNextStatuses, type ActorRole } from "@/lib/task-state-machine"
import { assignTask } from "@/actions/task-management-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface TaskDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: TaskWithUser | null
    isAdmin?: boolean
    workspaceId?: string
    /** Available users for "Assign to" picker (admin queue use case). */
    users?: { id: string; username: string; nickname?: string | null }[]
    onStatusChange?: (status: string) => void
    onDelete?: () => void
    onClose?: () => void
}

/**
 * Map giữa next-status (FSM) và button presentation.
 * Order: ưu tiên action thường gặp nhất trước.
 */
const STATUS_BUTTON_CONFIG: Record<string, {
    label: string
    icon: React.ComponentType<{ className?: string }>
    variant: 'primary' | 'success' | 'warning' | 'neutral' | 'danger'
}> = {
    'Đang thực hiện': { label: 'Bắt đầu / Tiếp tục', icon: Play, variant: 'primary' },
    'Revision': { label: 'Nộp bài (chuyển Revision)', icon: Send, variant: 'warning' },
    'Gửi lại': { label: 'Gửi lại sau khi sửa', icon: Send, variant: 'primary' },
    'Hoàn tất': { label: 'Hoàn tất', icon: CheckCircle2, variant: 'success' },
    'Tạm ngưng': { label: 'Tạm ngưng', icon: Pause, variant: 'neutral' },
    'Đang đợi giao': { label: 'Trả lại task', icon: AlertTriangle, variant: 'neutral' },
    'Nhận task': { label: 'Nhận task', icon: Play, variant: 'primary' },
    'Sửa frame': { label: 'Sửa frame', icon: AlertTriangle, variant: 'warning' },
    'Hủy': { label: 'Huỷ task', icon: Trash2, variant: 'danger' },
}

const VARIANT_STYLES: Record<string, string> = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20',
    neutral: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-white/10',
    danger: 'bg-red-600/15 hover:bg-red-600/25 text-red-300 border border-red-500/30',
}

export function TaskDrawer({
    open,
    onOpenChange,
    task,
    isAdmin,
    workspaceId,
    users,
    onStatusChange,
    onDelete,
}: TaskDrawerProps) {
    const router = useRouter()
    const [showAssignPicker, setShowAssignPicker] = useState(false)
    const [isAssigning, setIsAssigning] = useState(false)

    if (!task) return null
    const clientLabel = formatClientHierarchy(task.client)

    // Compute available transitions theo FSM (USER vs ADMIN)
    const actorRole: ActorRole = isAdmin ? 'ADMIN' : 'USER'
    const validNextStatuses = getValidNextStatuses(task.status, actorRole)

    const isOverdue = task.deadline
        && new Date() > new Date(task.deadline)
        && !['Hoàn tất', 'Đã hủy', 'Quá hạn', 'Tạm ngưng'].includes(task.status)

    // Admin can assign if task is unassigned & we have users list & workspaceId
    const canAssign = isAdmin && !task.assigneeId && !!users?.length && !!workspaceId

    const handleAssign = async (userId: string) => {
        if (!workspaceId) return
        setIsAssigning(true)
        try {
            const res = await assignTask(task.id, userId, workspaceId)
            if ((res as any)?.error) {
                toast.error((res as any).error)
            } else {
                toast.success('Đã giao task thành công')
                setShowAssignPicker(false)
                onOpenChange(false)
                router.refresh()
            }
        } finally {
            setIsAssigning(false)
        }
    }

    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />
                <Drawer.Content className="bg-zinc-950 flex flex-col rounded-t-[20px] h-[92%] mt-24 fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 outline-none">
                    <div className="p-4 bg-zinc-950 rounded-t-[20px] flex-1 overflow-auto">
                        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-700 mb-6" />

                        <div className="max-w-md mx-auto">
                            <Drawer.Title className="font-bold mb-2 text-2xl text-white">
                                {task.title}
                            </Drawer.Title>

                            <div className="flex flex-wrap items-center gap-2 mb-6">
                                <Badge variant="outline" className="border-white/15 text-zinc-200">{task.status}</Badge>
                                {task.type && (
                                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-200">{task.type}</Badge>
                                )}
                                {clientLabel && (
                                    <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">{clientLabel}</Badge>
                                )}
                                {isOverdue && (
                                    <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Quá hạn</Badge>
                                )}
                            </div>

                            <Separator className="my-4 bg-white/8" />

                            <div className="space-y-5">
                                {/* Details Grid */}
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="bg-zinc-900/60 p-3 rounded-xl border border-white/8">
                                        <div className="flex items-center gap-2 text-zinc-400 mb-1">
                                            <Calendar className="w-4 h-4" />
                                            <span className="text-xs uppercase tracking-wide">Hạn nộp</span>
                                        </div>
                                        <p className="font-mono text-sm text-zinc-100">
                                            {task.deadline
                                                ? `${new Date(task.deadline).toLocaleDateString('vi-VN')} ${new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                                                : 'Chưa đặt deadline'}
                                        </p>
                                    </div>
                                </div>

                                {/* Assignee */}
                                <div className="bg-zinc-900/40 p-4 rounded-xl border border-white/8">
                                    <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                                        <User className="w-4 h-4" /> Người thực hiện
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/30">
                                            {task.assignee?.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{task.assignee?.username || 'Chưa giao'}</p>
                                            <p className="text-xs text-zinc-500">
                                                {task.assignee ? 'Thành viên' : 'Bấm "Trả lại" để đẩy về marketplace'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Instructions */}
                                <div>
                                    <h4 className="text-sm font-medium text-zinc-400 mb-2">Hướng dẫn</h4>
                                    <div
                                        className="text-sm text-zinc-200 leading-relaxed bg-zinc-900/60 p-4 rounded-xl border border-white/8 prose prose-invert prose-sm max-w-none break-words"
                                        dangerouslySetInnerHTML={{
                                            __html: ensureExternalLinks(DOMPurify.sanitize(
                                                isAdmin
                                                    ? (task.notes_vi || 'Chưa có hướng dẫn cụ thể.')
                                                    : (task.notes_en || task.notes_vi || 'Chưa có hướng dẫn cụ thể.')
                                            ))
                                        }}
                                    />
                                </div>

                                {/* Product Link */}
                                {task.productLink && (
                                    <a
                                        href={task.productLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
                                    >
                                        <LinkIcon className="w-4 h-4" />
                                        Mở link sản phẩm
                                    </a>
                                )}

                                {/* References */}
                                {task.references && (
                                    <div>
                                        <h4 className="text-sm font-medium text-zinc-400 mb-2">Tham chiếu</h4>
                                        <div className="text-sm text-zinc-300 bg-zinc-900/60 p-3 rounded-xl border border-white/8 break-all">
                                            {task.references}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Fixed Footer Actions - iOS Safe Area aware */}
                    <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-zinc-950 border-t border-white/8 mt-auto">
                        <div className="max-w-md mx-auto space-y-2">
                            {/* Assign picker (admin queue mode) */}
                            {canAssign && showAssignPicker && (
                                <div className="bg-zinc-900/80 border border-white/10 rounded-xl p-2 max-h-60 overflow-y-auto">
                                    <div className="flex items-center justify-between px-2 pb-2">
                                        <span className="text-xs font-bold uppercase tracking-wide text-zinc-400 flex items-center gap-1.5">
                                            <Users className="w-3.5 h-3.5" /> Chọn người nhận
                                        </span>
                                        <button
                                            onClick={() => setShowAssignPicker(false)}
                                            className="text-xs text-zinc-500 hover:text-zinc-300"
                                        >
                                            Đóng
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {users!.map((u) => (
                                            <button
                                                key={u.id}
                                                disabled={isAssigning}
                                                onClick={() => handleAssign(u.id)}
                                                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors text-left disabled:opacity-50"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 text-xs font-bold">
                                                    {(u.nickname || u.username)[0]?.toUpperCase()}
                                                </div>
                                                <span className="text-sm text-zinc-100">
                                                    {u.nickname || u.username}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Assign trigger button (admin + unassigned) */}
                            {canAssign && !showAssignPicker && (
                                <button
                                    onClick={() => setShowAssignPicker(true)}
                                    className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <UserPlus className="w-4 h-4" />
                                    Giao task cho thành viên
                                </button>
                            )}

                            {/* Status transition buttons (FSM-driven) */}
                            {validNextStatuses.length > 0 && !showAssignPicker && (
                                <div className="grid grid-cols-1 gap-2">
                                    {validNextStatuses.map(nextStatus => {
                                        const config = STATUS_BUTTON_CONFIG[nextStatus] ?? {
                                            label: nextStatus,
                                            icon: Play,
                                            variant: 'neutral' as const,
                                        }
                                        const Icon = config.icon
                                        return (
                                            <button
                                                key={nextStatus}
                                                onClick={() => onStatusChange?.(nextStatus)}
                                                className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${VARIANT_STYLES[config.variant]}`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                {config.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Admin-only delete + close */}
                            {!showAssignPicker && (
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <Button
                                        variant="outline"
                                        onClick={() => onOpenChange(false)}
                                        className="w-full"
                                    >
                                        Đóng
                                    </Button>
                                    {isAdmin && onDelete && (
                                        <Button
                                            onClick={onDelete}
                                            variant="outline"
                                            className="w-full text-red-400 border-red-500/30 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="w-4 h-4 mr-1" /> Xoá
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    )
}
