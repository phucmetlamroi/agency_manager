// [Giao diện 2 · Mission Control · M4 Tiền — Payroll] Data-wired bảng-lương screen.
// Loads the SAME data as /admin/payroll (users + tasks + bonuses + payrolls, per the real
// payroll cycle parsed from the workspace name) and computes Thực nhận exactly like PayrollCard.
// Admin-gated (verifyProfileAdminAccess) so wages never reach non-admins; money is serialized
// server-side into a minimal DTO. Mark-paid / revert reuse confirmPayment / revertPayment.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { serializeDecimal } from '@/lib/serialization'
import { SALARY_COMPLETED_STATUS, SALARY_PENDING_STATUSES } from '@/lib/task-statuses'
import { extractPayrollCycle } from '@/lib/payroll-cycle'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
import { getDisplayName } from '@/lib/display-name'
import McPayrollBoard, { type McPayrollData, type McPayrollEditor } from '@/components/mission-control/McPayrollBoard'

export const dynamic = 'force-dynamic'

const RANK_HEX: Record<string, string> = { S: '#FACC15', A: '#34D399', B: '#60A5FA', C: '#A1A1AA', D: '#F87171' }
const GRADIENTS = [
    'linear-gradient(135deg,#6366F1,#8B5CF6)', 'linear-gradient(135deg,#10B981,#06B6D4)', 'linear-gradient(135deg,#EC4899,#F43F5E)',
    'linear-gradient(135deg,#A855F7,#EC4899)', 'linear-gradient(135deg,#F59E0B,#EAB308)', 'linear-gradient(135deg,#06B6D4,#3B82F6)',
]
function grad(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADIENTS[h % GRADIENTS.length] }
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return (name.trim().slice(0, 2) || '?').toUpperCase()
}
// "YYYY-MM" for the export URL (mirrors /admin/payroll's extractMonthParam).
function extractMonthParam(workspaceName?: string | null): string | null {
    if (!workspaceName) return null
    const m = workspaceName.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (!m) return null
    return `${m[2]}-${m[1].padStart(2, '0')}`
}

export default async function MissionControlPayrollPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Admin gate — payroll surfaces wages, the most sensitive data. Fail closed → dashboard.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    const [workspace, usersRaw, currentUser, finance] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
        // Same include as /admin/payroll — plus monthlyRanks for the S/A/B badge (MC style).
        wp.user.findMany({
            where: { username: { not: 'admin' } },
            include: {
                tasks: {
                    where: { workspaceId, status: { in: [SALARY_COMPLETED_STATUS, ...SALARY_PENDING_STATUSES] } },
                    orderBy: { updatedAt: 'desc' },
                    select: { status: true, value: true },
                },
                bonuses: { where: { workspaceId }, select: { bonusAmount: true, bonusPercent: true, rank: true } },
                payrolls: { where: { workspaceId }, select: { status: true } },
                monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } },
            },
            orderBy: { username: 'asc' },
        }),
        wp.user.findUnique({ where: { id: session.user.id }, select: { role: true, username: true, displayName: true, nickname: true } }),
        computeWorkspaceFinance(workspaceId, profileId),
    ])

    const cycle = extractPayrollCycle(workspace?.name)

    // Keep only editors with any salary-relevant footprint this cycle (mirrors /admin/payroll).
    const activeUsers = (usersRaw as any[]).filter((u) => {
        const hasCompleted = u.tasks.some((t: any) => t.status === SALARY_COMPLETED_STATUS)
        const hasPending = u.tasks.some((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
        return hasCompleted || hasPending || u.bonuses.length > 0 || u.payrolls.length > 0
    })
    activeUsers.sort((a, b) => {
        const ra = a.bonuses[0]?.rank || 999, rb = b.bonuses[0]?.rank || 999
        if (ra !== rb) return ra - rb
        return String(a.username).localeCompare(String(b.username), 'vi')
    })

    const serialized = serializeDecimal(activeUsers) as any[]

    const editors: McPayrollEditor[] = serialized.map((u) => {
        const completed = u.tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS)
        const pending = u.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status))
        const taskIncome = completed.reduce((s: number, t: any) => s + Number(t.value || 0), 0)
        const bonusAmount = Number(u.bonuses?.[0]?.bonusAmount || 0)
        const total = taskIncome + bonusAmount
        const rank = (u.monthlyRanks?.[0]?.rank as string | undefined) || undefined
        const name = getDisplayName(u)
        const totalTasks = completed.length + pending.length
        return {
            id: u.id, name, initials: initials(name), avatar: grad(u.id),
            rank, rankColor: rank ? (RANK_HEX[rank] || '#A1A1AA') : undefined,
            completedCount: completed.length, pendingCount: pending.length,
            progressPct: totalTasks > 0 ? Math.round((completed.length / totalTasks) * 100) : 0,
            taskIncomeVND: taskIncome, bonusVND: bonusAmount, totalVND: total,
            isPaid: u.payrolls?.[0]?.status === 'PAID',
        }
    })

    // KPI totals — verbatim aggregation of the fetched data (same math as /admin/payroll).
    const kpi = editors.reduce(
        (acc, e) => {
            acc.netVND += e.totalVND
            acc.bonusVND += e.bonusVND
            acc.doneCount += e.completedCount
            acc.pendingTaskCount += e.pendingCount
            if (e.isPaid) acc.paidCount += 1
            return acc
        },
        { netVND: 0, pendingVND: 0, bonusVND: 0, doneCount: 0, pendingTaskCount: 0, people: editors.length, paidCount: 0 },
    )
    // Pending income (Σ value of salary-pending tasks) — the "Chờ trả" amount.
    kpi.pendingVND = serialized.reduce(
        (s: number, u: any) => s + u.tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status)).reduce((a: number, t: any) => a + Number(t.value || 0), 0),
        0,
    )

    const monthParam = extractMonthParam(workspace?.name)
    const canExport = currentUser?.role === 'ADMIN'
    const data: McPayrollData = {
        workspaceId,
        backHref: `/${workspaceId}/admin`,
        workspaceName: workspace?.name || 'Workspace',
        periodLabel: `Tháng ${cycle.month}/${cycle.year}`,
        cycle,
        currentUserInitials: initials(getDisplayName(currentUser, { fallback: 'Admin' })),
        editors,
        kpi,
        exchangeRate: Number(finance.exchangeRate) || 0,
        canExport,
        exportUrl: monthParam
            ? `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}&month=${monthParam}`
            : `/api/exports/monthly-tasks-xlsx?workspaceId=${workspaceId}`,
        financeHref: `/${workspaceId}/mc/finance`,
        payrollBridgeHref: `/${workspaceId}/admin/payroll`,
    }

    return <McPayrollBoard data={data} />
}
