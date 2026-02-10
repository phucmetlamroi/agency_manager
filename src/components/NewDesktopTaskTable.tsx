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
    const { confirm } = useConfirm()

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
        <div className="glass-panel p-1">
            <TasksDataTable columns={columns} data={tasks} />

            <TaskDetailModal
                task={selectedTask}
                isOpen={!!selectedTask}
                onClose={() => setSelectedTask(null)}
                isAdmin={isAdmin}
            />
        </div>
    )
}
