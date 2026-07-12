// [Giao diện 2 · Mission Control] Full-screen alternate admin UI (M1 Tổng quan), DATA-WIRED.
// Loads the SAME data as /admin (tasks → the real 6 TaskWorkflowTabs columns, finance KPIs, leaderboard
// from users+ranks, clients) and renders the Mission Control board. Mounted OUTSIDE /admin so it renders
// its own shell — Giao diện 1 (/admin) is byte-identical. Admin-gated (verifyProfileAdminAccess) so the
// revenue/KPIs never reach non-admins. Presentation route: no server action, no schema.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { SALARY_PENDING_STATUSES, SALARY_COMPLETED_STATUS, isReviewPhaseStatus } from '@/lib/task-statuses'
import { getDisplayName } from '@/lib/display-name'
import { dedupeClientsByPath } from '@/lib/client-dedupe'
import MissionControlBoard, { type McColumn, type McTask, type McLeader } from '@/components/mission-control/MissionControlBoard'

export const dynamic = 'force-dynamic'

// ── design palette maps (from the Claude Design bundle + đối chiếu status table) ──
const STATUS_HEX: Record<string, string> = {
    'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang đợi giao': '#A855F7',
    'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
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
// TABS mapping — identical to src/components/TaskWorkflowTabs.tsx (the real admin board's 6 columns).
const TABS: { label: string; hue: string; statuses: string[]; accent?: 'danger' | 'success' }[] = [
    { label: 'Đã giao task', hue: '#3B82F6', statuses: ['Nhận task', 'Đã nhận task'] },
    { label: 'Đang làm', hue: '#EAB308', statuses: ['Đang thực hiện'] },
    { label: 'Duyệt nội bộ', hue: '#6366F1', statuses: ['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Revision'] },
    { label: 'Khách duyệt', hue: '#06B6D4', statuses: ['Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)'] },
    { label: 'Quá hạn', hue: '#DC2626', statuses: ['Quá hạn'], accent: 'danger' },
    { label: 'Hoàn tất', hue: '#10B981', statuses: ['Hoàn tất'], accent: 'success' },
]

export default async function MissionControlPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Admin gate — MC surfaces revenue/KPIs, so it must be profile OWNER/ADMIN of THIS workspace
    // (same check the /admin layout uses). Fail closed → send non-admins to their dashboard.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    await checkOverdueTasks(workspaceId)

    const [currentUser, workspace, tasks, users, cancelledCount, finance, allClientsRaw, pricingRulesRaw] = await Promise.all([
        wp.user.findUnique({ where: { id: session.user.id }, select: { username: true, nickname: true, displayName: true } }),
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
        wp.task.findMany({
            where: { isArchived: false },
            include: {
                assignee: { select: { id: true, username: true, displayName: true, nickname: true, monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } } } },
                client: { include: { parent: true } },
            },
            orderBy: { createdAt: 'desc' },
        }),
        wp.user.findMany({
            where: { role: { notIn: ['CLIENT', 'LOCKED'] } },
            select: { id: true, username: true, displayName: true, nickname: true, monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } } },
        }),
        wp.task.count({ where: { isArchived: true } }),
        computeWorkspaceFinance(workspaceId, profileId),
        // [M1 interactivity] Add-Task modal data — same sources as /admin/page.tsx.
        wp.client.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, parentId: true, parent: { select: { name: true } } },
            orderBy: { name: 'asc' },
        }),
        prisma.pricingRule.findMany({
            where: { workspaceId },
            select: { id: true, name: true, clientId: true, ruleType: true, config: true, isDefault: true },
            orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        }),
    ])

    // [M1 interactivity] Shape the Add-Task modal props exactly like /admin does
    // (dedupe duplicate Client rows; stringify ids; pass pricing rules + exchange rate).
    const allClients = dedupeClientsByPath(allClientsRaw)
    const addTaskData = {
        clients: allClients.map((c) => ({ ...c, id: String(c.id), parentId: c.parentId ? String(c.parentId) : null })),
        users: users.map((u: any) => ({ id: u.id, username: u.username, nickname: u.nickname, displayName: u.displayName })),
        pricingRules: pricingRulesRaw.map((r) => ({ id: r.id, name: r.name, clientId: r.clientId, ruleType: r.ruleType, config: r.config, isDefault: r.isDefault })),
        exchangeRate: finance.exchangeRate,
    }

    const now = new Date()
    // Time-of-day greeting in Vietnam time (UTC+7) — matches the design's "Chào buổi tối, …".
    const vnHour = (now.getUTCHours() + 7) % 24
    const greeting = vnHour < 11 ? 'Chào buổi sáng' : vnHour < 13 ? 'Chào buổi trưa' : vnHour < 18 ? 'Chào buổi chiều' : vnHour < 22 ? 'Chào buổi tối' : 'Chào buổi khuya'
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const isLiveOverdue = (t: any) =>
        t.status === 'Quá hạn' ||
        (t.deadline && new Date(t.deadline) < now && !isReviewPhaseStatus(t.status) && t.status !== 'Hoàn tất' && t.status !== 'Đã hủy')

    // KPIs (mirror /admin/page.tsx)
    const totalTasks = tasks.length
    const totalTasksDelta = tasks.filter((t: any) => { const d = new Date(t.createdAt); return d >= startOfLastMonth && d <= endOfLastMonth }).length
    const running = tasks.filter((t: any) => SALARY_PENDING_STATUSES.includes(t.status)).length
    const completed = tasks.filter((t: any) => t.status === SALARY_COMPLETED_STATUS).length
    const overdue = tasks.filter(isLiveOverdue).length
    const clientIds = new Set(tasks.map((t: any) => t.clientId).filter(Boolean))
    const totalClients = clientIds.size
    const clientsNew = new Set(tasks.filter((t: any) => new Date(t.createdAt) >= startOfMonth && t.clientId).map((t: any) => t.clientId)).size
    const waitingCount = tasks.filter((t: any) => !t.assigneeId && t.status !== 'Hoàn tất' && t.status !== 'Đã hủy' && t.status !== 'Quá hạn').length

    // 7-day sparkline of projected revenue (VND), same formula as /admin
    const sparkline = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(d.getDate() - (6 - i))
        const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const e = new Date(s.getTime() + 86400000)
        return tasks.filter((t: any) => { const td = new Date(t.updatedAt || t.createdAt); return td >= s && td < e })
            .reduce((sum: number, t: any) => sum + Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || finance.exchangeRate), 0)
    })

    // Board columns from the real TABS
    const shortDate = (d: Date) => `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`
    const metaFor = (t: any): string => {
        if (isLiveOverdue(t) && t.deadline) { const days = Math.floor((now.getTime() - new Date(t.deadline).getTime()) / 86400000); return days >= 1 ? `Trễ ${days} ngày` : 'Trễ hôm nay' }
        if (t.status === 'Quá hạn') return 'Quá hạn'
        if (t.deadline) return shortDate(new Date(t.deadline))
        return '—'
    }
    const toCard = (t: any): McTask => {
        const name = t.assignee ? getDisplayName(t.assignee) : 'Chưa giao'
        const rank = t.assignee?.monthlyRanks?.[0]?.rank as string | undefined
        return {
            id: t.id, title: t.title,
            statusLabel: STATUS_LABEL[t.status] || t.status, dot: STATUS_HEX[t.status] || '#A1A1AA',
            assignee: name, initials: initials(name), avatar: grad(t.assigneeId || name),
            rank: rank || undefined, rankColor: rank ? (RANK_HEX[rank] || '#A1A1AA') : undefined,
            meta: metaFor(t), danger: t.status === 'Quá hạn' || t.status === 'Đã nhận feedback (khách)',
        }
    }
    const columns: McColumn[] = TABS.map((tab) => {
        const inTab = tasks.filter((t: any) => tab.statuses.includes(t.status))
        const shown = inTab.slice(0, 3)
        const rest = inTab.length - shown.length
        return { label: tab.label, hue: tab.hue, accent: tab.accent, count: inTab.length, tasks: shown.map(toCard), moreText: rest > 0 ? `+ ${rest} task nữa` : '' }
    })

    // Leaderboard — top 3 by assigned-task count (from users + real ranks)
    const countByUser = new Map<string, number>()
    for (const t of tasks) if (t.assigneeId) countByUser.set(t.assigneeId, (countByUser.get(t.assigneeId) ?? 0) + 1)
    const leaderboard: McLeader[] = users
        .map((u: any) => ({ u, c: countByUser.get(u.id) ?? 0 }))
        .filter((x) => x.c > 0)
        .sort((a, b) => b.c - a.c)
        .slice(0, 3)
        .map((x, i) => {
            const name = getDisplayName(x.u)
            const rank = (x.u.monthlyRanks?.[0]?.rank as string | undefined) || '—'
            return { name, initials: initials(name), avatar: grad(x.u.id), sub: `${x.c} task`, rank, rankColor: RANK_HEX[rank] || '#A1A1AA', top: i === 0 }
        })

    // Client name chips (distinct, first 4)
    const seenClient = new Set<string>()
    const clientNames: string[] = []
    for (const t of tasks) {
        const c = t.client
        if (!c || !t.clientId || seenClient.has(String(t.clientId))) continue
        seenClient.add(String(t.clientId))
        clientNames.push(c.parent?.name || c.name)
        if (clientNames.length >= 4) break
    }

    return (
        <MissionControlBoard data={{
            greetingName: getDisplayName(currentUser, { fallback: 'bạn' }),
            greeting,
            workspaceName: workspace?.name || 'Workspace',
            backHref: `/${workspaceId}/admin`,
            workspaceId,
            kpi: { grossRevenueVND: finance.projectedRevenueVND, sparkline, totalTasks, totalTasksDelta, running, overdue, completed, totalClients, clientsNew },
            columns,
            leaderboard,
            clients: clientNames,
            clientsTotal: totalClients,
            cancelledCount,
            waitingCount,
            addTask: addTaskData,
            userRole: session.user.role,
        }} />
    )
}
