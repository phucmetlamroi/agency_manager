import { prisma } from '@/lib/db'
import { createTask } from '@/actions/admin-actions'
import { deleteTask } from '@/actions/task-management-actions'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'
import CreateTaskForm from '@/components/CreateTaskForm'
import { isMobileDevice } from '@/lib/device'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getSession } from '@/lib/auth'
import BottleneckAlert from '@/components/BottleneckAlert'
import AutoRefresh from '@/components/AutoRefresh'
import TaskCreationManager from '@/components/TaskCreationManager'
import TaskWorkflowTabs from '@/components/TaskWorkflowTabs'
import { KPIStats } from '@/components/dashboard/KPIStats'
import { serializeDecimal } from '@/lib/serialization'

export default async function AdminDashboard() {
    const session = await getSession()
    if (!session) redirect('/login')

    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
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
        ],
        include: { ownedAgency: true }
    })

    const agencies = await prisma.agency.findMany({ select: { id: true, name: true, code: true } })

    const unassignedTasks = tasks.filter(t => !t.assigneeId)
    const assignedTasks = tasks.filter(t => t.assigneeId)

    return (
        <div className="space-y-8">
            <AutoRefresh />

            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white title-gradient">Dashboard</h1>
                <p className="text-muted-foreground">Welcome back, {currentUser?.username}. Here's what's happening today.</p>
            </div>

            {/* KPI Section */}
            <KPIStats tasks={serializeDecimal(tasks)} />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

                {/* Left Column: Task Workflow (3/4 width) */}
                <div className="xl:col-span-3 space-y-6">
                    {/* Bottleneck Alert */}
                    <BottleneckAlert tasks={serializeDecimal(tasks) as any} />

                    {/* Tabs */}
                    <div className="glass-panel p-6 min-h-[500px]">
                        <TaskWorkflowTabs
                            tasks={serializeDecimal(assignedTasks.concat(unassignedTasks)) as any}
                            users={users}
                            agencies={agencies}
                            isMobile={await isMobileDevice()}
                        />
                    </div>
                </div>

                {/* Right Column: Quick Actions & Forms (1/4 width) */}
                <div className="space-y-6">
                    {/* Quick Create Task */}
                    <div className="glass-panel p-4">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-xl">⚡</span>
                            <h3 className="font-bold text-white">Quick Create</h3>
                        </div>
                        <TaskCreationManager users={users} />
                    </div>

                    {/* Pending Queue Summary */}
                    <div className="glass-panel p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-white">Queue</h3>
                            <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-gray-400">{unassignedTasks.length} pending</span>
                        </div>
                        {unassignedTasks.slice(0, 5).map(t => (
                            <div key={t.id} className="mb-2 p-2 bg-zinc-900/50 rounded border border-white/5 text-sm">
                                <div className="font-medium text-indigo-400 truncate">{t.title}</div>
                                <div className="text-xs text-gray-500">{t.client?.name || 'No Client'}</div>
                            </div>
                        ))}
                        {unassignedTasks.length > 5 && (
                            <div className="text-center mt-2 text-xs text-indigo-500 cursor-pointer">
                                View all in Queue
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
