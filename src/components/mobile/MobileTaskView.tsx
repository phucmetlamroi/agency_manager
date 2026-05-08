'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TaskWithUser } from '@/types/admin'
import { deleteTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import MobileTaskCard from './MobileTaskCard'
import MobileTaskCardSkeleton from './MobileTaskCardSkeleton'
import SwipeableCard, { SwipeAction } from './SwipeableCard'
import PullToRefresh from './PullToRefresh'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { TaskDrawer } from '@/components/mobile/TaskDrawer'
import { motion, AnimatePresence } from 'framer-motion'
import { Pause, CheckCircle2, Send, Play, Inbox } from 'lucide-react'
import { getValidNextStatuses, type ActorRole } from '@/lib/task-state-machine'

type TabKey = 'DOING' | 'ASSIGNED' | 'REVISE' | 'OVERDUE' | 'ALL'

// Tab labels match desktop NewDesktopTaskTable (English labels, Vietnamese
// status badge values bên trong card). Đồng nhất với PC.
const TAB_LABELS: Record<TabKey, string> = {
    DOING: 'Doing',
    ASSIGNED: 'Assignee',
    REVISE: 'Revise',
    OVERDUE: 'Overdue',
    ALL: 'All',
}

const TAB_ORDER: TabKey[] = ['DOING', 'ASSIGNED', 'REVISE', 'OVERDUE', 'ALL']

/**
 * Build swipe actions per task based on FSM-valid transitions.
 * Right swipe = primary positive action (Bắt đầu / Nộp bài / Hoàn tất / Gửi lại).
 * Left swipe = pause / return.
 */
function buildSwipeActions(
    task: TaskWithUser,
    isAdmin: boolean,
    onChange: (status: string) => void,
): { right?: SwipeAction; left?: SwipeAction } {
    const actorRole: ActorRole = isAdmin ? 'ADMIN' : 'USER'
    const valid = getValidNextStatuses(task.status, actorRole)

    let right: SwipeAction | undefined
    if (valid.includes('Đang thực hiện') && task.status === 'Nhận task') {
        right = {
            label: 'Start',
            icon: Play,
            color: 'bg-indigo-600 text-white',
            onAction: () => onChange('Đang thực hiện'),
        }
    } else if (valid.includes('Revision') && task.status === 'Đang thực hiện') {
        right = {
            label: 'Submit',
            icon: Send,
            color: 'bg-amber-600 text-white',
            onAction: () => onChange('Revision'),
        }
    } else if (valid.includes('Gửi lại') && task.status === 'Revision') {
        right = {
            label: 'Resubmit',
            icon: Send,
            color: 'bg-indigo-600 text-white',
            onAction: () => onChange('Gửi lại'),
        }
    } else if (valid.includes('Hoàn tất') && isAdmin) {
        right = {
            label: 'Complete',
            icon: CheckCircle2,
            color: 'bg-emerald-600 text-white',
            onAction: () => onChange('Hoàn tất'),
        }
    }

    let left: SwipeAction | undefined
    if (valid.includes('Tạm ngưng')) {
        left = {
            label: 'Pause',
            icon: Pause,
            color: 'bg-zinc-700 text-zinc-100',
            onAction: () => onChange('Tạm ngưng'),
        }
    } else if (valid.includes('Đang đợi giao')) {
        left = {
            label: 'Return',
            icon: Pause,
            color: 'bg-zinc-700 text-zinc-100',
            onAction: () => onChange('Đang đợi giao'),
        }
    }

    return { right, left }
}

export default function MobileTaskView({ tasks, isAdmin, workspaceId, users }: {
    tasks: TaskWithUser[]
    isAdmin: boolean
    users?: { id: string; username: string; nickname?: string | null }[]
    workspaceId: string
}) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [, startTransition] = useTransition()

    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const [isHydrating, setIsHydrating] = useState(true)

    // Filter State
    const [filteredTasks, setFilteredTasks] = useState<TaskWithUser[]>([])
    const [activeTab, setActiveTab] = useState<TabKey>('DOING')

    // Hide skeleton after first paint (visual fade-in for immediate feedback)
    useEffect(() => {
        const t = setTimeout(() => setIsHydrating(false), 150)
        return () => clearTimeout(t)
    }, [])

    // Filter Logic
    useEffect(() => {
        let res = tasks
        if (activeTab === 'ASSIGNED') res = tasks.filter(t => t.status === 'Nhận task')
        if (activeTab === 'DOING') res = tasks.filter(t => t.status === 'Đang thực hiện')
        if (activeTab === 'REVISE') res = tasks.filter(t => ['Revision', 'Sửa frame', 'Gửi lại'].includes(t.status))
        if (activeTab === 'OVERDUE') res = tasks.filter(t => t.status === 'Quá hạn')
        setFilteredTasks(res)
    }, [tasks, activeTab])

    const tabCount = (tab: TabKey): number => {
        if (tab === 'ASSIGNED') return tasks.filter(t => t.status === 'Nhận task').length
        if (tab === 'DOING') return tasks.filter(t => t.status === 'Đang thực hiện').length
        if (tab === 'REVISE') return tasks.filter(t => ['Revision', 'Sửa frame', 'Gửi lại'].includes(t.status)).length
        if (tab === 'OVERDUE') return tasks.filter(t => t.status === 'Quá hạn').length
        return tasks.length
    }

    const handleTaskClick = (task: TaskWithUser) => {
        if (!isAdmin && task.status === 'Nhận task') {
            toast.warning('🔒 Tap "Start" to unlock this task first.')
            return
        }
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const handleAction = (task: TaskWithUser) => {
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const performStatusChange = async (taskId: string, status: string) => {
        const res = await updateTaskStatus(taskId, status, workspaceId)
        if ((res as any)?.error) {
            toast.error((res as any).error)
            return false
        }
        toast.success(`Status changed to "${status}"`)
        // Refresh server data
        startTransition(() => router.refresh())
        return true
    }

    const handleStatusChangeFromDrawer = async (status: string) => {
        if (!selectedTask) return
        const ok = await performStatusChange(selectedTask.id, status)
        if (ok) {
            setIsDrawerOpen(false)
            setSelectedTask(null)
        }
    }

    const handleQuickStatusChange = async (task: TaskWithUser, status: string) => {
        await performStatusChange(task.id, status)
    }

    const handleDelete = async () => {
        if (!selectedTask) return
        if (await confirm({
            title: 'Delete Task',
            message: 'Are you sure you want to delete this task? This cannot be undone.',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        })) {
            await deleteTask(selectedTask.id, workspaceId)
            setIsDrawerOpen(false)
            toast.success('Task deleted')
            startTransition(() => router.refresh())
        }
    }

    const handleRefresh = async () => {
        await new Promise<void>((resolve) => {
            startTransition(() => {
                router.refresh()
                // Give Next a beat to fetch
                setTimeout(resolve, 600)
            })
        })
    }

    return (
        <div className="flex flex-col gap-3 pb-24 relative min-h-dvh">
            {/* Mobile Tabs - Sticky */}
            <div className="flex gap-2 overflow-x-auto pb-3 pt-2 px-2 no-scrollbar sticky top-[calc(52px+env(safe-area-inset-top))] bg-zinc-950/85 backdrop-blur-xl z-10 border-b border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                {TAB_ORDER.map(tab => {
                    const count = tabCount(tab)
                    const isActive = activeTab === tab
                    return (
                        <motion.button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            whileTap={{ scale: 0.94 }}
                            className={`relative px-3.5 py-2 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors border ${isActive
                                ? 'bg-white text-black border-white shadow-md shadow-white/10'
                                : 'bg-zinc-900/70 text-zinc-400 border-white/8 hover:text-zinc-200'
                                }`}
                        >
                            <span className="flex items-center gap-1.5">
                                {TAB_LABELS[tab]}
                                {count > 0 && (
                                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${isActive ? 'bg-zinc-900 text-white' : 'bg-white/10 text-zinc-300'
                                        }`}>
                                        {count}
                                    </span>
                                )}
                            </span>
                        </motion.button>
                    )
                })}
            </div>

            {/* Main scrollable list with pull-to-refresh */}
            <PullToRefresh onRefresh={handleRefresh}>
                <div className="space-y-3 px-2">
                    {isHydrating ? (
                        <>
                            <MobileTaskCardSkeleton />
                            <MobileTaskCardSkeleton />
                            <MobileTaskCardSkeleton />
                        </>
                    ) : (
                        <AnimatePresence mode="popLayout">
                            {filteredTasks.map((task, idx) => {
                                const swipe = buildSwipeActions(task, isAdmin, (status) => handleQuickStatusChange(task, status))
                                return (
                                    <motion.div key={task.id} layout>
                                        <SwipeableCard
                                            rightAction={swipe.right}
                                            leftAction={swipe.left}
                                        >
                                            <MobileTaskCard
                                                task={task}
                                                isAdmin={isAdmin}
                                                onAction={handleAction}
                                                onQuickStatusChange={handleQuickStatusChange}
                                                index={idx}
                                            />
                                        </SwipeableCard>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    )}

                    {/* Empty state */}
                    {!isHydrating && filteredTasks.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-16 px-4 flex flex-col items-center gap-3"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-zinc-900/60 border border-white/8 flex items-center justify-center">
                                <Inbox className="w-7 h-7 text-zinc-500" />
                            </div>
                            <div>
                                <p className="text-zinc-300 font-semibold">No tasks</p>
                                <p className="text-zinc-500 text-sm mt-1">
                                    No tasks in "{TAB_LABELS[activeTab]}".
                                </p>
                            </div>
                        </motion.div>
                    )}
                </div>
            </PullToRefresh>

            <TaskDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                task={selectedTask}
                isAdmin={isAdmin}
                workspaceId={workspaceId}
                users={users}
                onStatusChange={handleStatusChangeFromDrawer}
                onDelete={handleDelete}
            />
        </div>
    )
}
