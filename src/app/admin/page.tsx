import { prisma } from '@/lib/db'
import { createTask } from '@/actions/admin-actions'
import { deleteTask } from '@/actions/task-management-actions'
import { revalidatePath } from 'next/cache'
import TaskTable from '@/components/TaskTable'
import CreateTaskForm from '@/components/CreateTaskForm'
import { isMobileDevice } from '@/lib/device'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getSession } from '@/lib/auth'
import BottleneckAlert from '@/components/BottleneckAlert'
import TaskCreationManager from '@/components/TaskCreationManager'

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
        include: {
            assignee: true,
            client: {
                include: { parent: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
        where: currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
        orderBy: [
            { reputation: 'desc' },
            { username: 'asc' }
        ]
    })

    const unassignedTasks = tasks.filter(t => !t.assigneeId)
    const assignedTasks = tasks.filter(t => t.assigneeId)

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'start' }}>


            {/* Create Task Form Area */}
            <TaskCreationManager users={users} />

            {/* Task Lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* Bottleneck Alert */}
                <BottleneckAlert tasks={tasks as any} />

                import TaskWorkflowTabs from '@/components/TaskWorkflowTabs'

                // ... (inside component return)

                {/* Task Lists */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                    {/* Bottleneck Alert */}
                    <BottleneckAlert tasks={tasks as any} />

                    {/* WORKFLOW TABS (Replaces old Active Tasks list) */}
                    <div>
                        <h3 style={{ marginBottom: '1rem', color: '#ccc' }}>🔥 Tiến Độ Công Việc</h3>
                        <TaskWorkflowTabs
                            tasks={assignedTasks.concat(unassignedTasks) as any}
                            users={users}
                            isMobile={await isMobileDevice()}
                        />
                    </div>
                </div>
            </div>

        </div>
    )
}
