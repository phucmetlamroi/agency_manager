'use client'

import { TaskWithUser } from '@/types/admin'
import { motion } from 'framer-motion'
import { MoreVertical, Play, Send, CheckCircle2, Pause, AlertTriangle, Clock } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { getValidNextStatuses, type ActorRole } from '@/lib/task-state-machine'

// ─── Status palette aligned với design-system ─────────────────
// emerald=success, indigo=pending, amber=in-progress, red=urgent
// rose=cancelled, sky=waiting, violet=initial, pink=variant
const STATUS_PALETTE: Record<string, { dot: string; text: string; bg: string }> = {
    'Đang đợi giao': { dot: 'bg-violet-500', text: 'text-violet-300', bg: 'bg-violet-500/10' },
    'Nhận task': { dot: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-500/10' },
    'Đang thực hiện': { dot: 'bg-amber-500', text: 'text-amber-300', bg: 'bg-amber-500/10' },
    'Revision': { dot: 'bg-red-500', text: 'text-red-300', bg: 'bg-red-500/10' },
    'Sửa frame': { dot: 'bg-pink-500', text: 'text-pink-300', bg: 'bg-pink-500/10' },
    'Gửi lại': { dot: 'bg-sky-500', text: 'text-sky-300', bg: 'bg-sky-500/10' },
    'Tạm ngưng': { dot: 'bg-zinc-500', text: 'text-zinc-300', bg: 'bg-zinc-500/10' },
    'Quá hạn': { dot: 'bg-red-600', text: 'text-red-400', bg: 'bg-red-600/10' },
    'Hoàn tất': { dot: 'bg-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500/10' },
    'Đã hủy': { dot: 'bg-rose-500', text: 'text-rose-300', bg: 'bg-rose-500/10' },
}

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    'Đang thực hiện': Play,
    'Revision': Send,
    'Gửi lại': Send,
    'Hoàn tất': CheckCircle2,
    'Tạm ngưng': Pause,
    'Đang đợi giao': AlertTriangle,
    'Nhận task': Play,
    'Sửa frame': AlertTriangle,
}

interface MobileTaskCardProps {
    task: TaskWithUser
    onAction: (task: TaskWithUser) => void
    onQuickStatusChange?: (task: TaskWithUser, newStatus: string) => void
    isAdmin: boolean
    index?: number
}

export default function MobileTaskCard({
    task,
    onAction,
    onQuickStatusChange,
    isAdmin,
    index = 0,
}: MobileTaskCardProps) {
    const palette = STATUS_PALETTE[task.status] ?? {
        dot: 'bg-zinc-500',
        text: 'text-zinc-300',
        bg: 'bg-zinc-500/10',
    }

    const isOverdue = task.deadline
        && new Date() > new Date(task.deadline)
        && !['Hoàn tất', 'Đã hủy', 'Quá hạn', 'Tạm ngưng'].includes(task.status)

    const clientLabel = formatClientHierarchy(task.client)

    // FSM-driven primary action — picks first valid "forward" transition for inline quick-button.
    const actorRole: ActorRole = isAdmin ? 'ADMIN' : 'USER'
    const validNextStatuses = getValidNextStatuses(task.status, actorRole)
    // Inline button shows "primary positive" action: Bắt đầu / Nộp bài / Gửi lại / Hoàn tất
    const primaryActionStatus = validNextStatuses.find(s =>
        ['Đang thực hiện', 'Revision', 'Gửi lại', 'Hoàn tất'].includes(s)
    )

    const PRIMARY_LABEL: Record<string, string> = {
        'Đang thực hiện': 'Start',
        'Revision': 'Submit',
        'Gửi lại': 'Resubmit',
        'Hoàn tất': 'Complete',
    }

    const handleCardClick = () => onAction(task)

    const handlePrimaryAction = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (primaryActionStatus && onQuickStatusChange) {
            onQuickStatusChange(task, primaryActionStatus)
        }
    }

    const handleQuickAction = (e: React.MouseEvent, status: string) => {
        e.stopPropagation()
        if (onQuickStatusChange) {
            onQuickStatusChange(task, status)
        }
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: 'easeOut' }}
            whileTap={{ scale: 0.985 }}
            onClick={handleCardClick}
            className="relative bg-zinc-950/60 backdrop-blur-xl rounded-2xl border border-white/8 shadow-xl shadow-black/30 overflow-hidden cursor-pointer"
        >
            {/* Status accent bar (left) */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${palette.dot}`} />

            <div className="p-4 pl-5">
                {/* ── Header row: type + 3-dot menu ── */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">
                                {task.type || 'TASK'}
                            </span>
                            {clientLabel && (
                                <span className="text-[10px] uppercase font-medium text-indigo-400 tracking-wide truncate">
                                    · {clientLabel}
                                </span>
                            )}
                        </div>
                        <h3 className="text-white font-extrabold text-base leading-tight line-clamp-2 tracking-tight">
                            {task.title}
                        </h3>
                    </div>

                    {/* Real 3-dot menu (Popover) */}
                    {validNextStatuses.length > 0 && (
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/5 active:bg-white/10 transition-colors"
                                    aria-label="Quick actions"
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content
                                    side="bottom"
                                    align="end"
                                    sideOffset={6}
                                    className="z-50 min-w-[180px] rounded-xl bg-zinc-950/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60 p-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {validNextStatuses.map((nextStatus) => {
                                        const Icon = STATUS_ICONS[nextStatus] ?? Play
                                        return (
                                            <button
                                                key={nextStatus}
                                                onClick={(e) => handleQuickAction(e, nextStatus)}
                                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5 active:bg-white/10 transition-colors text-left"
                                            >
                                                <Icon className="w-4 h-4 text-zinc-400" />
                                                <span>Change to "{nextStatus}"</span>
                                            </button>
                                        )
                                    })}
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    )}
                </div>

                {/* ── Status pill + Deadline row ── */}
                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${palette.bg} border border-white/5`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
                        <span className={`text-[11px] font-semibold ${palette.text}`}>
                            {task.status}
                        </span>
                    </div>

                    {task.deadline && (
                        <div className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                            <Clock className="w-3 h-3" />
                            <span className="font-mono">
                                {new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                {' '}
                                {new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Footer: value (admin) / assignee (user) + inline action ── */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                        {isAdmin ? (
                            <span className="font-mono font-bold text-emerald-400 text-sm drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]">
                                {Number(task.value || 0).toLocaleString()} đ
                            </span>
                        ) : (
                            task.assignee && (
                                <span className="text-xs text-zinc-500 truncate">
                                    @{task.assignee.username}
                                </span>
                            )
                        )}
                    </div>

                    {/* Inline primary action */}
                    {primaryActionStatus && PRIMARY_LABEL[primaryActionStatus] && (
                        <button
                            onClick={handlePrimaryAction}
                            className={`flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${primaryActionStatus === 'Hoàn tất'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                                : primaryActionStatus === 'Revision'
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                                }`}
                        >
                            {primaryActionStatus === 'Hoàn tất' ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : primaryActionStatus === 'Revision' ? (
                                <Send className="w-3.5 h-3.5" />
                            ) : (
                                <Play className="w-3.5 h-3.5" />
                            )}
                            {PRIMARY_LABEL[primaryActionStatus]}
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    )
}
