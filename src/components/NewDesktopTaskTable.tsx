"use client"

import { useState } from 'react'
import { TaskWithUser } from '@/types/admin'
import { TasksDataTable } from './tasks/TasksDataTable'
import { getColumns } from './tasks/columns'
import { TaskDetailModal } from './tasks/TaskDetailModal'
import { deleteTask } from '@/actions/task-management-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'

interface DesktopTaskTableProps {
    tasks: TaskWithUser[]
    isAdmin?: boolean
    users?: any[]
    agencies?: any[]
}

export default function DesktopTaskTable({ tasks, isAdmin = false, users = [], agencies = [] }: DesktopTaskTableProps) {
    const [selectedTask, setSelectedTask] = useState<TaskWithUser | null>(null)
    const [rowSelection, setRowSelection] = useState({})
    const { confirm } = useConfirm()

    const selectedIds = Object.keys(rowSelection)

    const handleDelete = async (id: string) => {
        if (await confirm({
            title: 'Delete Task',
            message: 'Are you sure you want to delete this task?',
            type: 'danger'
        })) {
            await deleteTask(id)
            toast.success('Task deleted')
            window.location.reload()
        }
    }

    const handleBulkDelete = async () => {
        if (await confirm({
            title: `Delete ${selectedIds.length} Tasks`,
            message: `Are you sure you want to delete ${selectedIds.length} selected tasks? This cannot be undone.`,
            type: 'danger'
        })) {
            const { bulkDeleteTasks } = await import('@/actions/bulk-task-actions')
            const res = await bulkDeleteTasks(selectedIds)
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success(`Deleted ${res.count} tasks`)
                setRowSelection({})
                window.location.reload()
            }
        }
    }

    const columns = getColumns(
        users,
        agencies,
        isAdmin,
        (task) => {
            if (!isAdmin && task.status === 'Đã nhận task') {
                toast.warning('🔒 Vui lòng bấm "Bắt đầu" để mở khóa task!')
                return
            }
            setSelectedTask(task)
        }, // onTaskClick
        handleDelete // onDelete
    )

    return (
        <div className="glass-panel p-1 relative">
            {/* BULK ACTION BAR */}
            {selectedIds.length > 0 && (
                <div className="absolute top-[-50px] left-0 right-0 bg-zinc-900 border border-zinc-800 p-2 rounded-lg flex items-center justify-between shadow-2xl animate-in slide-in-from-top-2 z-50">
                    <span className="text-white font-bold ml-2">
                        {selectedIds.length} tasks selected
                    </span>
                    <div className="flex gap-2">
                        {/* We can add more bulk actions here later */}
                        {isAdmin && (
                            <button
                                onClick={handleBulkDelete}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-xs flex items-center gap-2"
                            >
                                🗑 Delete Selected
                            </button>
                        )}
                    </div>
                </div>
            )}

            <TasksDataTable
                columns={columns}
                data={tasks}
                rowSelection={rowSelection}
                setRowSelection={setRowSelection}
            />

            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={isAdmin}
                bulkSelectedIds={selectedIds} // Pass for Bulk Edit
            />
        </div>
    )
}
