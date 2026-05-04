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
import Link from 'next/link'
import { CalendarDays, LayoutGrid, Search, Bell, ChevronDown } from 'lucide-react'

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

            {/* ── Ambient radial gradients (matches design body::before) ── */}
            <div
                className="fixed inset-0 pointer-events-none z-0"
                style={{
                    background:
                        'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.08), transparent 60%), ' +
                        'radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.08), transparent 60%)',
                }}
            />

            {/* ── Top Bar ─────────────────────────────────────── */}
            <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-0 sticky top-0 z-20 flex items-center px-7 h-[72px] border-b border-white/5 bg-[rgba(10,10,10,0.50)] backdrop-blur-[10px] gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-[22px] font-extrabold text-zinc-100 tracking-[-0.02em]">
                        Workspace Dashboard
                    </h1>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Chào mừng trở lại, <strong className="text-zinc-400">{displayName}</strong>. Đây là tổng quan hôm nay.
                    </p>
                </div>
                <div className="flex-1" />
                {/* Search */}
                <button className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-400 flex items-center justify-center hover:bg-white/[0.06] transition-colors">
                    <Search className="w-4 h-4" />
                </button>
                {/* Bell */}
                <button className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] text-zinc-400 flex items-center justify-center hover:bg-white/[0.06] transition-colors">
                    <Bell className="w-4 h-4" />
                </button>
                {/* Profile pill */}
                <div className="flex items-center gap-2 py-1.5 pl-1.5 pr-3 rounded-full bg-white/[0.04] border border-white/[0.08]">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-[10px]">
                        {initials}
                    </div>
                    <span className="text-xs font-semibold text-zinc-300">{displayName}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                </div>
            </div>

            {/* ── Action Bar ──────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-transparent border border-white/[0.08] text-zinc-400 text-xs font-semibold cursor-default">
                    <CalendarDays className="w-3.5 h-3.5" /> This month
                </button>
                <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-transparent border border-white/[0.08] text-zinc-400 text-xs font-semibold cursor-default">
                        <LayoutGrid className="w-3.5 h-3.5" /> Manage widgets
                    </button>
                    <Link
                        href={`/${workspaceId}/admin/queue`}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 border border-transparent text-white text-xs font-bold shadow-[0_8px_20px_rgba(79,70,229,0.35)] hover:bg-indigo-500 transition-colors"
                    >
                        + Add new task
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

            {/* ── Revenue Chart + Rankings (flex 1.5 : 1) ──────── */}
            <div className="flex flex-col xl:flex-row gap-4">
                <div className="xl:flex-[1.5] min-w-0">
                    <AdminRevenueChart
                        data={revenueChartData}
                        totalRevenue={weekRevenue}
                        prevRevenue={prevWeekRevenue}
                    />
                </div>
                <div className="xl:flex-1 min-w-0 min-h-[340px]">
                    <Suspense fallback={
                        <div className="h-full rounded-[20px] bg-[rgba(24,24,27,0.60)] border border-white/[0.06] animate-pulse flex items-center justify-center text-zinc-500 text-sm">
                            Đang tải Bảng Xếp Hạng...
                        </div>
                    }>
                        <Leaderboard workspaceId={workspaceId} />
                    </Suspense>
                </div>
            </div>

            {/* ── Bottleneck Alert ─────────────────────────────── */}
            <BottleneckAlert tasks={serializeDecimal(tasks) as any} />

            {/* ── Task Workflow Tabs ───────────────────────────── */}
            <div className="rounded-[20px] border border-white/[0.06] bg-[rgba(24,24,27,0.60)] backdrop-blur-[12px] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
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
