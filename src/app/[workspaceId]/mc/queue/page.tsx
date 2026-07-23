// [Giao diện 2 · Mission Control · M2 Kho Task Đợi / Triage] Data-wired giao-việc screen.
// Loads the SAME data as /admin/queue (waiting tasks + editors + marketplace state) and renders
// the Mission Control triage board. Admin-gated (verifyProfileAdminAccess) so wages/KPIs never
// reach non-admins. Assign + marketplace toggle reuse the real server actions.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { checkOverdueTasks } from '@/actions/reputation-actions'
import { getDisplayName } from '@/lib/display-name'
import McQueueBoard, { type McQueueData, type McQueueTask, type McQueueEditor } from '@/components/mission-control/McQueueBoard'

export const dynamic = 'force-dynamic'

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
const RANK_HEX: Record<string, string> = { S: '#FACC15', A: '#34D399', B: '#60A5FA', C: '#A1A1AA', D: '#F87171' }
const TYPE_HUE: Record<string, string> = { 'Short form': '#38BDF8', 'Long form': '#A78BFA', 'Trial': '#FBBF24' }
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
// A task is "active workload" for an editor if it isn't done/cancelled/back-in-queue.
const IDLE_STATUSES = new Set(['Hoàn tất', 'Đã hủy', 'Đang đợi giao'])
const INTERNAL_REVIEW = new Set(['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Revision'])

export default async function MissionControlQueuePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    await checkOverdueTasks(workspaceId)

    const [workspace, tasks, users, mktRow] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
        wp.task.findMany({
            where: { isArchived: false },
            include: { client: { include: { parent: true } } },
            orderBy: { createdAt: 'desc' },
        }),
        wp.user.findMany({
            where: { role: { notIn: ['CLIENT', 'LOCKED'] } },
            select: { id: true, username: true, displayName: true, nickname: true, monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } } },
        }),
        // [marketplaceOpen] Column may not be in the generated client on every branch — read
        // defensively (matches /admin/queue), so a missing column never crashes the page.
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { marketplaceOpen: true } as any }).catch(() => null),
    ])
    const marketplaceOpen = (mktRow as any)?.marketplaceOpen ?? true

    // Waiting = unassigned OR explicitly parked at "Đang đợi giao" (mirrors /admin/queue).
    const waitingRows = (tasks as any[]).filter((t) => !t.assigneeId || t.status === 'Đang đợi giao')

    const fmtDeadline = (d: any): string => {
        if (!d) return '—'
        const dt = new Date(d)
        return `${WD[dt.getDay()]} ${dt.getDate()}/${String(dt.getMonth() + 1).padStart(2, '0')}`
    }
    const clientLabel = (t: any): string => {
        const c = t.client
        if (!c) return ''
        return c.parent?.name ? `${c.parent.name} / ${c.name}` : c.name
    }
    const waiting: McQueueTask[] = waitingRows.map((t) => ({
        id: t.id,
        title: t.title,
        desc: clientLabel(t),
        type: t.type || '—',
        typeHue: TYPE_HUE[t.type] || '#A1A1AA',
        deadline: fmtDeadline(t.deadline),
        priceVND: Number(t.wageVND ?? t.value ?? 0),
        hasRaw: !!t.resources && /RAW:\s*[^|\s]/.test(t.resources),
        hasAssignee: !!t.assigneeId,
    }))

    const counts = {
        short: waitingRows.filter((t) => t.type === 'Short form').length,
        long: waitingRows.filter((t) => t.type === 'Long form').length,
        trial: waitingRows.filter((t) => t.type === 'Trial').length,
    }
    const producing = (tasks as any[]).filter((t) => t.status === 'Đang thực hiện').length
    const internalReview = (tasks as any[]).filter((t) => INTERNAL_REVIEW.has(t.status)).length

    // Per-editor active workload (for the "Giao cho ai?" popover).
    const loadByUser = new Map<string, number>()
    for (const t of tasks as any[]) {
        if (t.assigneeId && !IDLE_STATUSES.has(t.status)) loadByUser.set(t.assigneeId, (loadByUser.get(t.assigneeId) ?? 0) + 1)
    }
    const editors: McQueueEditor[] = (users as any[]).map((u) => {
        const name = getDisplayName(u)
        const rank = (u.monthlyRanks?.[0]?.rank as string | undefined) || undefined
        const workingCount = loadByUser.get(u.id) ?? 0
        return {
            id: u.id, name, initials: initials(name), avatar: grad(u.id),
            rank, rankColor: rank ? (RANK_HEX[rank] || '#A1A1AA') : undefined,
            workingCount, workloadPct: Math.min(100, Math.round((workingCount / 5) * 100)),
            blocked: rank === 'D',
        }
    })

    const data: McQueueData = {
        workspaceId,
        backHref: `/${workspaceId}/admin`,
        workspaceName: workspace?.name || 'Workspace',
        waiting,
        waitingTotal: waiting.length,
        counts,
        producing,
        internalReview,
        editors,
        marketplaceOpen,
    }

    return <McQueueBoard data={data} />
}
