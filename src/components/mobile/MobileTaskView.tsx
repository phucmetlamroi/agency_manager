'use client'

import { useState, useEffect } from 'react'
import { TaskWithUser } from '@/types/admin'
import { deleteTask, assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import MobileTaskCard from './MobileTaskCard'
import MobileActionSheet from './MobileActionSheet'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { TaskDrawer } from '@/components/mobile/TaskDrawer'

export default function MobileTaskView({ tasks, isAdmin, users }: { tasks: TaskWithUser[], isAdmin: boolean, users: any[] }) {
    const { confirm } = useConfirm()
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [actionSheetOpen, setActionSheetOpen] = useState(false)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // Filter State
    const [filteredTasks, setFilteredTasks] = useState<TaskWithUser[]>([])
    const [activeTab, setActiveTab] = useState<'ALL' | 'ASSIGNED' | 'DOING' | 'review'>('DOING')

    // Filter Logic
    useEffect(() => {
        let res = tasks
        if (activeTab === 'ASSIGNED') res = tasks.filter(t => t.status === 'Đã nhận task')
        if (activeTab === 'DOING') res = tasks.filter(t => t.status === 'Đang thực hiện')
        if (activeTab === 'review') res = tasks.filter(t => t.status === 'Review' || t.status === 'Revision' || t.status === 'Sửa frame')
        // ALL matches everything
        setFilteredTasks(res)
    }, [tasks, activeTab])

    const handleTaskClick = (task: TaskWithUser) => {
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const handleAction = (task: TaskWithUser) => {
        setSelectedTask(task)
        setIsDrawerOpen(true)
    }

    const handleStatusChange = async (status: string) => {
        if (!selectedTask) return
        await updateTaskStatus(selectedTask.id, status)
        setActionSheetOpen(false)
        setIsDrawerOpen(false)
        setSelectedTask(null)
    }

    const handleDelete = async () => {
        if (!selectedTask) return
        if (await confirm({
            title: 'Delete Task?',
            message: 'Are you sure you want to delete this task? This cannot be undone.',
            type: 'danger',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        })) {
            await deleteTask(selectedTask.id)
            setIsDrawerOpen(false)
            toast.success('Task deleted successfully')
        }
    }

    return (
        <div className="flex flex-col gap-3 pb-24 relative min-h-screen bg-black/95">
            {/* Mobile Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-4 pt-2 px-2 no-scrollbar sticky top-0 bg-black/95 z-10">
                {['DOING', 'ASSIGNED', 'review', 'ALL'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-4 py-2 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors border ${activeTab === tab
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                            }`}
                    >
                        {tab === 'review' ? 'Review' : tab}
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
                <div className="text-center py-20 text-gray-500 italic">
                    No tasks found in {activeTab}.
                </div>
            )}

            {/* Legacy Action Sheet (Optional, keeping for specific interactions if needed, or remove) */}
            {/* We integrated actions into Drawer, so we might not need this anymore unless for specific legacy flows */}
            <MobileActionSheet
                task={selectedTask}
                isOpen={actionSheetOpen}
                onClose={() => setActionSheetOpen(false)}
                onStatusChange={handleStatusChange}
                onEdit={() => { }}
                onDelete={handleDelete}
                isAdmin={isAdmin}
            />

            <TaskDrawer
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                task={selectedTask}
                isAdmin={isAdmin}
                onEdit={() => {
                    setIsDrawerOpen(false)
                    // Open edit modal logic if implemented
                    toast.info("Edit mode not fully ported to drawer yet.")
                }}
            />

            {/* FLOATING ACTION BUTTON (FAB) */}
            <button
                onClick={() => {
                    if (isAdmin) {
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                    } else {
                        toast.info("Create Request feature coming soon!")
                    }
                }}
                className="fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center text-2xl font-bold text-white z-40 active:scale-90 transition-transform"
            >
                +
            </button>
        </div>
    )
}
