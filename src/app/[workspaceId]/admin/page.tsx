import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isMobileDevice } from '@/lib/device'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { SALARY_PENDING_STATUSES, SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import { serializeDecimal } from '@/lib/serialization'
import { Suspense } from 'react'

import AutoRefresh from '@/components/AutoRefresh'
import BottleneckAlert from '@/components/BottleneckAlert'
import TaskWorkflowTabs from '@/components/TaskWorkflowTabs'
import Leaderboard from '@/components/dashboard/Leaderboard'
import { AdminKPIWidgets } from '@/components/dashboard/AdminKPIWidgets'
import { AdminRevenueChart } from '@/components/dashboard/AdminRevenueChart'
import DashboardTopBar from '@/components/dashboard/DashboardTopBar'
import DashboardActionWrapper from '@/components/dashboard/DashboardActionWrapper'

export default async function AdminDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const profileId = (session.user as any).sessionProfileId
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    const currentUser = await workspacePrisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true, nickname: true }
    })

    // 1. Run overdue check
    await checkOverdueTasks(workspaceId)

    // 2. Fetch all tasks
    const tasks = await workspacePrisma.task.findMany({
        include: {
            assignee: {
                select: {
                    id: true, username: true, role: true, nickname: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
                }
            },
            client: { include: { parent: true } },
            taskTags: { include: { tagCategory: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
    })

    // 3. Users list
    const users = await workspacePrisma.user.findMany({
        where: {
            AND: [
                currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
                { role: { notIn: ['CLIENT', 'LOCKED'] } }
            ]
        },
        orderBy: [{ username: 'asc' }],
        select: {
            id: true, username: true, role: true, nickname: true,
            monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } }
        }
    })

    // 4. Client count + client list for AddTaskModal
    const totalClientsTarget = await (workspacePrisma as any).client.count({ where: { parentId: null } })
    const activeClientIds = new Set(tasks.map((t: any) => t.clientId).filter(Boolean))
    const totalClients = activeClientIds.size

    const allClients = await workspacePrisma.client.findMany({
        select: { id: true, name: true, parentId: true, parent: { select: { name: true } } },
        orderBy: { name: 'asc' },
    })

    // ── KPI Calculations ──────────────────────────────────────────
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const completedTasks = tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
    const completedLastMonth = completedTasks.filter((t: any) => {
        const d = new Date(t.createdAt)
        return d >= startOfLastMonth && d <= endOfLastMonth
    })

    const grossRevenue = completedTasks.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
    const grossRevenuePrev = completedLastMonth.reduce((s: number, t: any) => s + Number(t.value || 0), 0)

    const tasksInProgress = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status)).length
    const tasksCompleted = completedTasks.length

    const lastMonthTasks = tasks.filter((t: any) => {
        const d = new Date(t.createdAt)
        return d >= startOfLastMonth && d <= endOfLastMonth
    })

    const clientsNew = tasks.filter((t: any) => {
        const d = new Date(t.createdAt)
        return d >= startOfMonth && t.clientId
    }).reduce((s: Set<string>, t: any) => { s.add(t.clientId); return s }, new Set<string>()).size

    // ── Sparkline: last 7 completed task values aggregated by creation ──
    const sparklineData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now)
        d.setDate(d.getDate() - (6 - i))
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
        const dayEnd = new Date(dayStart.getTime() + 86400000)
        const dayTotal = completedTasks
            .filter((t: any) => {
                const td = new Date(t.updatedAt || t.createdAt)
                return td >= dayStart && td < dayEnd
            })
            .reduce((s: number, t: any) => s + Number(t.value || 0), 0)
        return { v: dayTotal }
    })

    // ── Revenue by weekday (Mon-Sun) ──────────────────────────────
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const revenueByDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    completedTasks.forEach((t: any) => {
        const raw = new Date(t.updatedAt || t.createdAt).getDay()
        const mapped = (raw + 6) % 7
        revenueByDay[mapped] = (revenueByDay[mapped] || 0) + Number(t.value || 0)
    })
    // ── Task count by weekday (for dual-line chart) ────────────
    const tasksByDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
    completedTasks.forEach((t: any) => {
        const raw = new Date(t.updatedAt || t.createdAt).getDay()
        const mapped = (raw + 6) % 7
        tasksByDay[mapped] = (tasksByDay[mapped] || 0) + 1
    })
    const revenueChartData = DAYS.map((day, i) => ({ day, revenue: revenueByDay[i] || 0, tasks: tasksByDay[i] || 0 }))

    // Revenue totals this/prev week
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1)
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfPrevWeek = new Date(startOfWeek)
    startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7)

    const weekRevenue = completedTasks
        .filter((t: any) => new Date(t.updatedAt || t.createdAt) >= startOfWeek)
        .reduce((s: number, t: any) => s + Number(t.value || 0), 0)
    const prevWeekRevenue = completedTasks
        .filter((t: any) => {
            const d = new Date(t.updatedAt || t.createdAt)
            return d >= startOfPrevWeek && d < startOfWeek
        })
        .reduce((s: number, t: any) => s + Number(t.value || 0), 0)

    const unassignedTasks = tasks.filter((t: any) => !t.assigneeId)
    const assignedTasks = tasks.filter((t: any) => t.assigneeId)

    const displayName = currentUser?.nickname || currentUser?.username || 'Admin'
    const initials = displayName.split(/\s+/).map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || 'AD'

    return (
        <div className="flex flex-col gap-5">
            <AutoRefresh />

            {/* ── Ambient neon glow (subtle purple radials) ── */}
            <div
                className="fixed inset-0 pointer-events-none z-0"
                style={{
                    background:
                        'radial-gradient(800px 500px at 10% -8%, rgba(139,92,246,0.06), transparent 55%), ' +
                        'radial-gradient(600px 400px at 95% 105%, rgba(168,85,247,0.04), transparent 50%)',
                }}
            />

            {/* ── Top Bar (Welcome Section) ──────────────────── */}
            <DashboardTopBar
                displayName={displayName}
                initials={initials}
                workspaceId={workspaceId}
            />

            {/* ── Action Bar + Add Task Modal ──────────────────── */}
            <DashboardActionWrapper
                workspaceId={workspaceId}
                clients={allClients.map(c => ({ ...c, id: String(c.id), parentId: c.parentId ? String(c.parentId) : null }))}
                users={users.map(u => ({ id: u.id, username: u.username, nickname: u.nickname }))}
            />

            {/* ── KPI Widgets ──────────────────────────────────── */}
            <AdminKPIWidgets data={{
                grossRevenue,
                grossRevenuePrev,
                totalTasks: tasks.length,
                totalTasksPrev: lastMonthTasks.length,
                tasksInProgress,
                tasksCompleted,
                totalClients,
                totalClientsTarget,
                clientsNew,
                sparklineData,
            }} />

            {/* ── Revenue Chart + Rankings (flex 2 : 1) ──────── */}
            <div className="flex flex-col xl:flex-row gap-4">
                <div className="xl:flex-[2] min-w-0">
                    <AdminRevenueChart
                        data={revenueChartData}
                        totalRevenue={weekRevenue}
                        prevRevenue={prevWeekRevenue}
                    />
                </div>
                <div className="xl:flex-1 min-w-0">
                    <Suspense fallback={
                        <div className="h-full rounded-[26px] bg-[#0A0A0A] border border-[rgba(139,92,246,0.15)] animate-pulse flex items-center justify-center text-[#A1A1AA] text-sm">
                            Loading Rankings...
                        </div>
                    }>
                        <Leaderboard workspaceId={workspaceId} />
                    </Suspense>
                </div>
            </div>

            {/* ── Bottleneck Alert ─────────────────────────────── */}
            <BottleneckAlert tasks={serializeDecimal(tasks) as any} />

            {/* ── Task Workflow Tabs ───────────────────────────── */}
            <TaskWorkflowTabs
                tasks={serializeDecimal(assignedTasks.concat(unassignedTasks)) as any}
                users={users}
                isMobile={await isMobileDevice()}
                isAdmin={true}
                workspaceId={workspaceId}
            />

            {/* Safe spacer */}
            <div className="h-10" />
        </div>
    )
}
