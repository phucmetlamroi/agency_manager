'use client'

import { TaskWithUser } from '@/types/admin'
import { motion } from 'framer-motion'
import { MoreVertical, Play, Send, CheckCircle2, Pause, AlertTriangle, Clock } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import { getValidNextStatuses, type ActorRole } from '@/lib/task-state-machine'
import { taskTypeLabel } from '@/lib/display-labels'
import { isReviewPhaseStatus } from '@/lib/task-statuses'
import { getStatusInfo } from '@/components/tasks/detail-sections/_shared'

// Status colours now come from the shared getStatusInfo map (single source of
// truth — see @/components/tasks/detail-sections/_shared). Icons stay local.
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
    // Unified status colour (hex + rgba bg) from the shared map.
    const statusInfo = getStatusInfo(task.status)

    const isOverdue = task.deadline
        && new Date() > new Date(task.deadline)
        && !['Hoàn tất', 'Đã hủy', 'Quá hạn', 'Tạm ngưng'].includes(task.status)
        && !isReviewPhaseStatus(task.status) // [Owner 2026-07-08] review-phase (2 tab duyệt) không tính quá hạn

    const clientLabel = formatClientHierarchy(task.client)

    // FSM-driven primary action — picks first valid "forward" transition for inline quick-button.
    const actorRole: ActorRole = isAdmin ? 'ADMIN' : 'USER'
    const validNextStatuses = getValidNextStatuses(task.status, actorRole)
    // Inline button shows "primary positive" action: Bắt đầu / Nộp bài / Gửi lại / Hoàn tất
    const primaryActionStatus = validNextStatuses.find(s =>
        ['Đang thực hiện', 'Revision', 'Gửi lại', 'Hoàn tất'].includes(s)
    )

    const PRIMARY_LABEL: Record<string, string> = {
        'Đang thực hiện': 'Bắt đầu',
        'Revision': 'Nộp bài',
        'Gửi lại': 'Gửi lại',
        'Hoàn tất': 'Hoàn tất',
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
            {/* Status accent bar (left) — unified status colour */}
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: statusInfo.color }} />

            <div className="p-3.5 pl-4">
                {/* ── Line 1: meta (type · client) + deadline ── */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex-shrink-0">
                            {taskTypeLabel(task.type) || 'TASK'}
                        </span>
                        {clientLabel && (
                            <span className="text-[10px] uppercase font-medium text-primary-accent tracking-wide truncate">
                                · {clientLabel}
                            </span>
                        )}
                    </div>

                    {task.deadline && (
                        <div className={`flex items-center gap-1 text-[11px] flex-shrink-0 ${isOverdue ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                            <Clock className="w-3 h-3" />
                            <span className="font-mono">
                                {new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                                {' '}
                                {new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Line 2: title + 3-dot menu (44×44 effective tap target) ── */}
                <div className="flex items-start justify-between gap-1">
                    <h3 className="text-white font-extrabold text-base leading-tight line-clamp-2 break-words min-w-0 flex-1 tracking-tight">
                        {task.title}
                    </h3>

                    {/* Real 3-dot menu (Popover) — bg is transparent so the 44px box is invisible hit-area */}
                    {validNextStatuses.length > 0 && (
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mr-1.5 rounded-lg text-muted-foreground hover:text-zinc-200 hover:bg-white/5 active:bg-white/10 transition-colors"
                                    aria-label="Thao tác nhanh"
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
                                                <span>Chuyển sang "{nextStatus}"</span>
                                            </button>
                                        )
                                    })}
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    )}
                </div>

                {/* ── Line 3: status pill + value/assignee + inline action ── */}
                <div className="flex items-center justify-between gap-2 mt-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold min-w-0 max-w-full"
                            style={{ background: statusInfo.bg, color: statusInfo.color, border: `1px solid color-mix(in srgb, ${statusInfo.color} 18.82%, transparent)` }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusInfo.color }} />
                            <span className="truncate">{statusInfo.label}</span>
                        </span>

                        {/* Money must never truncate (zero-data-loss); pill shrinks first. */}
                        {isAdmin ? (
                            <span className="font-mono font-bold text-emerald-400 text-sm drop-shadow-[0_0_6px_rgba(52,211,153,0.4)] flex-shrink-0">
                                {Number(task.value || 0).toLocaleString()} đ
                            </span>
                        ) : (
                            task.assignee && (
                                <span className="text-xs text-muted-foreground truncate">
                                    {(task.assignee as any).displayName?.trim() || `@${task.assignee.username}`}
                                </span>
                            )
                        )}
                    </div>

                    {/* Inline primary action — min-h-[44px] tap target */}
                    {primaryActionStatus && PRIMARY_LABEL[primaryActionStatus] && (
                        <button
                            onClick={handlePrimaryAction}
                            className={`flex-shrink-0 inline-flex items-center justify-center gap-1 px-3.5 min-h-[44px] rounded-lg text-xs font-bold transition-all active:scale-95 ${primaryActionStatus === 'Hoàn tất'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                                : primaryActionStatus === 'Revision'
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                                    : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20'
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
