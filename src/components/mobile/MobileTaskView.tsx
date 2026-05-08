'use client'

import { useState, useEffect } from 'react'
import { TaskWithUser } from '@/types/admin'
import { deleteTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import MobileTaskCard from './MobileTaskCard'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { TaskDrawer } from '@/components/mobile/TaskDrawer'

type TabKey = 'DOING' | 'ASSIGNED' | 'REVISE' | 'OVERDUE' | 'ALL'

const TAB_LABELS: Record<TabKey, string> = {
    DOING: '\u0110ang l\u00e0m',
    ASSIGNED: 'Nh\u1eadn task',
    REVISE: 'C\u1ea7n s\u1eeda',
    OVERDUE: 'Qu\u00e1 h\u1ea1n',
    ALL: 'T\u1ea5t c\u1ea3',
}

export default function MobileTaskView({ tasks, isAdmin, workspaceId }: { tasks: TaskWithUser[], isAdmin: boolean, users?: any[], workspaceId: string }) {
    const { confirm } = useConfirm()
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // Filter State
    const [filteredTasks, setFilteredTasks] = useState<TaskWithUser[]>([])
    const [activeTab, setActiveTab] = useState<TabKey>('DOING')

    // Filter Logic \u2014 [Sprint A] g\u1ed9p Revision/S\u1eeda frame/G\u1eedi l\u1ea1i v\u00e0o tab "C\u1ea7n s\u1eeda"
    useEffect(() => {
        let res = tasks
        if (activeTab === 'ASSIGNED') res = tasks.filter(t => t.status === 'Nh\u1eadn task')
        if (activeTab === 'DOING') res = tasks.filter(t => t.status === '\u0110ang th\u1ef1c hi\u1ec7n')
        if (activeTab === 'REVISE') res = tasks.filter(t => ['Revision', 'S\u1eeda frame', 'G\u1eedi l\u1ea1i'].includes(t.status))
        if (activeTab === 'OVERDUE') res = tasks.filter(t => t.status === 'Qu\u00e1 h\u1ea1n')
        // ALL matches everything
        setFilteredTasks(res)
    }, [tasks, activeTab])

    const handleTaskClick = (task: TaskWithUser) => {
        if (!isAdmin && task.status === 'Nh\u1eadn task') {
            toast.warning('\ud83d\udd12 Vui l\u00f2ng b\u1ea5m "B\u1eaft \u0111\u1ea7u" \u0111\u1ec3 m\u1edf kho\u00e1 task!')
            return
        }
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const handleAction = (task: TaskWithUser) => {
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const handleStatusChange = async (status: string) => {
        if (!selectedTask) return
        const res = await updateTaskStatus(selectedTask.id, status, workspaceId)
        if ((res as any)?.error) {
            toast.error((res as any).error)
            return
        }
        toast.success(`\u0110\u00e3 chuy\u1ec3n sang "${status}"`)
        setIsDrawerOpen(false)
        setSelectedTask(null)
    }

    const handleDelete = async () => {
        if (!selectedTask) return
        if (await confirm({
            title: 'Xo\u00e1 task?',
            message: 'B\u1ea1n c\u00f3 ch\u1eafc mu\u1ed1n xo\u00e1 task n\u00e0y? H\u00e0nh \u0111\u1ed9ng kh\u00f4ng th\u1ec3 ho\u00e0n t\u00e1c.',
            type: 'danger',
            confirmText: 'Xo\u00e1',
            cancelText: 'Hu\u1ef7'
        })) {
            await deleteTask(selectedTask.id, workspaceId)
            setIsDrawerOpen(false)
            toast.success('\u0110\u00e3 xo\u00e1 task')
        }
    }

    const tabKeys: TabKey[] = isAdmin
        ? ['DOING', 'ASSIGNED', 'REVISE', 'OVERDUE', 'ALL']
        : ['DOING', 'ASSIGNED', 'REVISE', 'OVERDUE', 'ALL']

    return (
        <div className="flex flex-col gap-3 pb-24 relative min-h-dvh bg-black/95">
            {/* Mobile Tabs - Offset by header height */}
            <div className="flex gap-2 overflow-x-auto pb-4 pt-2 px-2 no-scrollbar sticky top-[calc(52px+env(safe-area-inset-top))] bg-black/95 z-10 border-b border-white/5 shadow-lg">
                {tabKeys.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors border ${activeTab === tab
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                            }`}
                    >
                        {TAB_LABELS[tab]}
                    </button>
                ))}
            </div>

            <div className="space-y-4 px-2">
                {filteredTasks.map(task => (
                    <div key={task.id} onClick={() => handleTaskClick(task)}>
                        <MobileTaskCard
                            task={task}
                            isAdmin={isAdmin}
                            onAction={handleAction}
                        />
                    </div>
                ))}
            </div>

            {filteredTasks.length === 0 && (
                <div className="text-center py-20 text-zinc-500 italic">
                    Không có task nào trong "{TAB_LABELS[activeTab]}".
                </div>
            )}

            <TaskDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                task={selectedTask}
                isAdmin={isAdmin}
                workspaceId={workspaceId}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
            />

            {/* FLOATING ACTION BUTTON (FAB) — admin only, scroll-to-top */}
            {isAdmin && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center text-2xl font-bold text-white z-40 active:scale-90 transition-transform"
                    aria-label="Lên đầu trang"
                >
                    ↑
                </button>
            )}
        </div>
    )
}
