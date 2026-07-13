// [Giao diện 2 · Mission Control · M10 Add Task] Standalone route hosting the real AddTaskModal.
// Fetches the SAME add-task data as /mc (clients + users + pricingRules + exchangeRate) and renders
// McAddScreen, which mounts the money-safe DashboardActionWrapper (controlled, hideBar). All task
// creation still flows through createTask/… which re-check ADMIN server-side. Admin-gated fail-closed.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { computeWorkspaceFinance } from '@/lib/finance-helpers'
import { dedupeClientsByPath } from '@/lib/client-dedupe'
import McAddScreen from '@/components/mission-control/McAddScreen'
import type { McAddTaskData } from '@/components/mission-control/McTopbarActions'

export const dynamic = 'force-dynamic'

export default async function MissionControlAddTaskPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Admin gate — task creation carries USD pricing/profit. Fail closed → dashboard.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    const [currentUser, users, allClientsRaw, pricingRulesRaw, finance] = await Promise.all([
        wp.user.findUnique({ where: { id: session.user.id }, select: { role: true } }),
        wp.user.findMany({
            where: { role: { notIn: ['CLIENT', 'LOCKED'] } },
            select: { id: true, username: true, displayName: true, nickname: true },
        }),
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
        computeWorkspaceFinance(workspaceId, profileId),
    ])

    const allClients = dedupeClientsByPath(allClientsRaw)
    const addTask: McAddTaskData = {
        clients: allClients.map((c) => ({ ...c, id: String(c.id), parentId: c.parentId ? String(c.parentId) : null })),
        users: users.map((u: any) => ({ id: u.id, username: u.username, nickname: u.nickname, displayName: u.displayName })),
        pricingRules: pricingRulesRaw.map((r) => ({ id: r.id, name: r.name, clientId: r.clientId, ruleType: r.ruleType, config: r.config, isDefault: r.isDefault })),
        exchangeRate: finance.exchangeRate,
    }

    return <McAddScreen workspaceId={workspaceId} addTask={addTask} userRole={currentUser?.role || 'USER'} />
}
