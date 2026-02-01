'use client'

import { useState } from 'react'
import { TaskWithUser } from '@/types/admin'
import { deleteTask, assignTask } from '@/actions/task-management-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import MobileTaskCard from './MobileTaskCard'
import MobileActionSheet from './MobileActionSheet'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'

export default function MobileTaskView({ tasks, isAdmin, users }: { tasks: TaskWithUser[], isAdmin: boolean, users: any[] }) {
    const { confirm } = useConfirm()
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [actionSheetOpen, setActionSheetOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    // TODO: Implement Full Screen Edit Modal logic if needed. 
    // For now, we reuse the Logic from Desktop but styled for Mobile, or just rely on Action Sheet triggers.

    // We can reuse the same Modal from Desktop but style it full screen?
    // User requested "Full Screen or Drawer". 
    // We will emit an event or handle it here.

    const handleAction = (task: TaskWithUser) => {
        setSelectedTask(task)
        setActionSheetOpen(true)
    }

    const handleStatusChange = async (status: string) => {
        if (!selectedTask) return
        await updateTaskStatus(selectedTask.id, status)
        setActionSheetOpen(false)
        setSelectedTask(null)
        // Refresh handled by Server Action revalidate usually, or router.refresh() if needed
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
            setActionSheetOpen(false)
            toast.success('Task deleted successfully')
        }
    }

    // Reuse Edit Modal from Desktop? Or built a new one?
    // Let's rely on the parent or a separate Edit Component.
    // For speed, let's keep it simple: Action Sheet is the main interaction.
    // Edit Details is complex. I'll defer it to "TaskTable" main controller to render the Edit Modal (shared).

    return (
        <div className="flex flex-col gap-3 pb-24">
            {/* Filter / Search placeholder */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                {['All', 'My Tasks', 'Urgent'].map(filter => (
                    <button key={filter} className="px-4 py-1.5 rounded-full bg-gray-800 border border-white/10 text-xs font-bold whitespace-nowrap text-gray-400 focus:bg-blue-600 focus:text-white transition-colors">
                        {filter}
                    </button>
                ))}
            </div>

            {tasks.map(task => (
                <MobileTaskCard
                    key={task.id}
                    task={task}
                    isAdmin={isAdmin}
                    onAction={handleAction}
                />
            ))}

            {tasks.length === 0 && (
                <div className="text-center py-20 text-gray-500 italic">
                    No tasks found.
                </div>
            )}

            <MobileActionSheet
                task={selectedTask}
                isOpen={actionSheetOpen}
                onClose={() => setActionSheetOpen(false)}
                onStatusChange={handleStatusChange}
                onEdit={() => {
                    toast.info("Edit feature coming to Mobile View soon! Please use Desktop for full editing.")
                    // Future: Open <MobileEditModal />
                }}
                onDelete={handleDelete}
                isAdmin={isAdmin}
            />

            {/* FLOATING ACTION BUTTON (FAB) */}
            <button
                onClick={() => {
                    // Trigger create modal or navigation
                    // Ideally this should open a Full Screen "Create Task" form.
                    // For now, we reuse the action logic or redirect?
                    // Simplest: If Admin, redirect to /admin (which is this page) but trigger modal?
                    // Let's just show an alert or open a Create Drawer if implemented.

                    if (isAdmin) {
                        // Scroll to top or trigger Create Form?
                        // The Create Form is currently at the top of Admin Page. 
                        // Maybe scroll to top?
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                        // Or alert "Use form at top"
                    } else {
                        // User Request?
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
