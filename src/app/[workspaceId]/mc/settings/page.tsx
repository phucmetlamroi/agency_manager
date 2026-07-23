// [Giao diện 2 · Mission Control · M30 Cài đặt Workspace] MC-shell wrapping the real 4-tab
// WorkspaceSettingsPanel (Tổng quan · Kết nối OAuth · Bảng giá · StudyPlace; tabs đã tự sync ?tab=).
// Mirrors /admin/settings data-fetch EXACTLY (same prisma reads + actions) → panel NGUYÊN VẸN,
// /admin/settings byte-identical. Gate verifyWorkspaceAccess('ADMIN') (fail-closed) — cùng cổng
// admin, đồng thời cấp currentUserRole + isGlobalAdmin panel cần (danger-zone soft-delete workspace
// = OWNER-only enforced server-side trong deleteWorkspaceAction).
// NOTE (GĐ1 follow-up, ngoài scope): WorkspaceSettingsPanel sau khi xóa workspace `router.push('/workspace')`
// — route đó KHÔNG tồn tại (chỉ là đích redirect trong next.config) → lands 404. Lỗi CÓ SẴN trong
// component GĐ1 dùng chung; sửa sẽ đổi GĐ1 → để dev GĐ1 xử (đích đúng có lẽ /welcome).
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { dedupeClientsByPath } from '@/lib/client-dedupe'
import { getStudyPlaceProgress } from '@/actions/study-place-actions'
import WorkspaceSettingsPanel from '@/components/workspace/WorkspaceSettingsPanel'
import McShell from '@/components/mission-control/McShell'

export const dynamic = 'force-dynamic'

export default async function MissionControlSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    let workspaceRole = 'MEMBER'
    let isGlobalAdmin = false
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        workspaceRole = access.workspaceRole
        isGlobalAdmin = access.isGlobalAdmin
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true, description: true, status: true, deletedAt: true, hardDeleteAfter: true, profileId: true },
    })
    if (!workspace) redirect(`/${workspaceId}/dashboard`)

    const memberCount = await prisma.workspaceMember.count({ where: { workspaceId } })

    const integrationsRaw = await prisma.integrationToken.findMany({
        where: { workspaceId, userId: session.user!.id },
        select: { provider: true, accountEmail: true, createdAt: true, updatedAt: true },
    })
    const integrations = integrationsRaw.map((i) => ({
        provider: i.provider,
        accountEmail: i.accountEmail,
        connectedAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
    }))

    const pricingRulesRaw = await prisma.pricingRule.findMany({
        where: { workspaceId },
        include: { client: { select: { id: true, name: true } } },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    const pricingRules = pricingRulesRaw.map((r) => ({
        id: r.id, name: r.name, clientId: r.clientId, ruleType: r.ruleType,
        config: r.config, isDefault: r.isDefault, sortOrder: r.sortOrder, client: r.client,
    }))

    const clients = workspace.profileId
        ? dedupeClientsByPath(
              await prisma.client.findMany({
                  where: { profileId: workspace.profileId, status: 'ACTIVE' },
                  select: { id: true, name: true, parentId: true },
                  orderBy: { name: 'asc' },
              }),
          )
        : []

    const studyProgress = await getStudyPlaceProgress(workspaceId)

    const serializedWorkspace = {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        deletedAt: workspace.deletedAt?.toISOString() ?? null,
        hardDeleteAfter: workspace.hardDeleteAfter?.toISOString() ?? null,
    }

    return (
        <McShell workspaceId={workspaceId} active="settings">
            <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#F4F4F5', marginBottom: 22 }}>Cài đặt Workspace</h2>
                <WorkspaceSettingsPanel
                    workspaceId={workspaceId}
                    workspace={serializedWorkspace}
                    currentUserRole={workspaceRole}
                    isGlobalAdmin={isGlobalAdmin}
                    memberCount={memberCount}
                    integrations={integrations}
                    pricingRules={pricingRules}
                    clients={clients}
                    studyProgress={studyProgress}
                />
            </div>
        </McShell>
    )
}
