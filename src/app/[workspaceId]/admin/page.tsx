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
import { WorkflowStepsBar } from '@/components/dashboard/WorkflowStepsBar'
import Link from 'next/link'

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

    // 4. Client count
    const totalClientsTarget = await (workspacePrisma as any).client.count({ where: { parentId: null } })
    const activeClientIds = new Set(tasks.map((t: any) => t.clientId).filter(Boolean))
    const totalClients = activeClientIds.size

    // ── KPI Calculations ──────────────────────────────────────────
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const completedTasks = tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
    const completedThisMonth = completedTasks.filter((t: any) => new Date(t.createdAt) >= startOfMonth)
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
        // JS getDay: 0=Sun,1=Mon…6=Sat → remap so Mon=0
        const raw = new Date(t.updatedAt || t.createdAt).getDay()
        const mapped = (raw + 6) % 7
        revenueByDay[mapped] = (revenueByDay[mapped] || 0) + Number(t.value || 0)
    })
    const revenueChartData = DAYS.map((day, i) => ({ day, revenue: revenueByDay[i] || 0, tasks: 0 }))

    // Revenue totals this/prev week
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1) // Mon
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

    // ── Workflow step counts ────────────────────────────────────
    const workflowCounts = {
        assignee: tasks.filter((t: any) => ['Nhận task', 'Đang đợi giao'].includes(t.status)).length,
        progress: tasks.filter((t: any) => ['Đang thực hiện', 'Review'].includes(t.status)).length,
        revise: tasks.filter((t: any) => ['Revision', 'Gửi lại'].includes(t.status)).length,
        complete: tasksCompleted,
    }

    const unassignedTasks = tasks.filter((t: any) => !t.assigneeId)
    const assignedTasks = tasks.filter((t: any) => t.assigneeId)

    const displayName = currentUser?.nickname || currentUser?.username || 'Admin'

    return (
        <div className="space-y-6">
            <AutoRefresh />

            {/* ── Page Header ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-zinc-100 tracking-tight">
                        Workspace Dashboard
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Chào mừng trở lại, <span className="text-indigo-400 font-semibold">{displayName}</span>. Đây là tổng quan hôm nay.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                    <Link
                        href={`/${workspaceId}/admin/queue`}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all duration-200 shadow-lg shadow-indigo-900/40"
                    >
                        <span className="text-lg leading-none">+</span>
                        Thêm Task mới
                    </Link>
                </div>
            </div>

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

            {/* ── Revenue Chart + Rankings (2-col) ─────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-7">
                    <AdminRevenueChart
                        data={revenueChartData}
                        totalRevenue={weekRevenue}
                        prevRevenue={prevWeekRevenue}
                    />
                </div>
                <div className="xl:col-span-5 min-h-[340px]">
                    <Suspense fallback={
                        <div className="h-full rounded-2xl bg-zinc-950/60 border border-white/5 animate-pulse flex items-center justify-center text-zinc-500 text-sm">
                            Đang tải Bảng Xếp Hạng...
                        </div>
                    }>
                        <Leaderboard workspaceId={workspaceId} />
                    </Suspense>
                </div>
            </div>

            {/* ── Bottleneck Alert ─────────────────────────────── */}
            <BottleneckAlert tasks={serializeDecimal(tasks) as any} />

            {/* ── Workflow Steps Bar ───────────────────────────── */}
            <WorkflowStepsBar counts={workflowCounts} />

            {/* ── Task Workflow Tabs ───────────────────────────── */}
            <div className="rounded-2xl border border-white/8 bg-zinc-950/60 backdrop-blur-sm overflow-hidden shadow-lg">
                <TaskWorkflowTabs
                    tasks={serializeDecimal(assignedTasks.concat(unassignedTasks)) as any}
                    users={users}
                    isMobile={await isMobileDevice()}
                    isAdmin={true}
                    workspaceId={workspaceId}
                />
            </div>

            {/* Safe spacer */}
            <div className="h-10" />
        </div>
    )
}
