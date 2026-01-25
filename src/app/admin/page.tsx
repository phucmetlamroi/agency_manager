import { prisma } from '@/lib/db'
import { createTask } from '@/actions/admin-actions'
import { deleteTask } from '@/actions/task-management-actions'
import { revalidatePath } from 'next/cache'
import TaskTable from '@/components/TaskTable'
import CreateTaskForm from '@/components/CreateTaskForm'

import { checkOverdueTasks } from '@/actions/reputation-actions'

import { getSession } from '@/lib/auth'

export default async function AdminDashboard() {
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { username: true }
    })

    // 1. Run Logic to Deduct Points for Overdue Tasks
    const checkResult = await checkOverdueTasks()
    // In a real app we might show a toast with checkResult.notifications

    const tasks = await prisma.task.findMany({
        include: { assignee: true },
        orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
        where: currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
        orderBy: { username: 'asc' }
    })

    const unassignedTasks = tasks.filter(t => !t.assigneeId)
    const assignedTasks = tasks.filter(t => t.assigneeId)

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'start' }}>

            {/* Create Task Form */}
            <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Giao Việc Mới</h3>
                <CreateTaskForm users={users} />
            </div>

            {/* Task Lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* ACTIVE TASKS */}
                <div>
                    <h3 style={{ marginBottom: '1rem', color: '#ccc' }}>🔥 Đang Thực Hiện ({assignedTasks.length})</h3>
                    <TaskTable tasks={assignedTasks as any} isAdmin={true} users={users} />
                </div>
            </div>

        </div>
    )
}
