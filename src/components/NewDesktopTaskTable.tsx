"use client"

import { TaskWithUser } from '@/types/admin'
import { TasksDataTable } from './tasks/TasksDataTable'
import { columns } from './tasks/columns'

interface DesktopTaskTableProps {
    tasks: TaskWithUser[]
    isAdmin?: boolean
    users?: any[]
    agencies?: any[]
}

export default function DesktopTaskTable({ tasks, isAdmin, users, agencies }: DesktopTaskTableProps) {
    // We can extend columns here if we need specific access to props,
    // or we just use the default columns. 
    // The default columns 'actions' might need to know about 'isAdmin'.
    // For now, let's use the standard columns.

    return (
        <div className="glass-panel p-1">
            <TasksDataTable columns={columns} data={tasks} />
        </div>
    )
}
