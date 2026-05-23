import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import WorkspaceSettingsPanel from '@/components/workspace/WorkspaceSettingsPanel'

export default async function AdminSettingsPage({
    params,
}: {
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Minimum ADMIN to access settings
    let workspaceRole = 'MEMBER'
    let isGlobalAdmin = false
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        workspaceRole = access.workspaceRole
        isGlobalAdmin = access.isGlobalAdmin
    } catch {
        redirect(`/${workspaceId}/admin`)
    }

    // Fetch workspace details
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            name: true,
            description: true,
            status: true,
            deletedAt: true,
            hardDeleteAfter: true,
            profileId: true,
        },
    })

    if (!workspace) redirect(`/${workspaceId}/admin`)

    // Count members
    const memberCount = await prisma.workspaceMember.count({
        where: { workspaceId },
    })

    // [Quick Create] Fetch integrations for the current user in this workspace
    const integrationsRaw = await prisma.integrationToken.findMany({
        where: { workspaceId, userId: session.user!.id },
        select: {
            provider: true,
            accountEmail: true,
            createdAt: true,
            updatedAt: true,
        },
    })
    const integrations = integrationsRaw.map((i) => ({
        provider: i.provider,
        accountEmail: i.accountEmail,
        connectedAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
    }))

    // [Quick Create] Fetch pricing rules for this workspace
    const pricingRulesRaw = await prisma.pricingRule.findMany({
        where: { workspaceId },
        include: {
            client: { select: { id: true, name: true } },
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    const pricingRules = pricingRulesRaw.map((r) => ({
        id: r.id,
        name: r.name,
        clientId: r.clientId,
        ruleType: r.ruleType,
        config: r.config,
        isDefault: r.isDefault,
        sortOrder: r.sortOrder,
        client: r.client,
    }))

    // [Quick Create] Fetch clients in this profile (for pricing rule scope dropdown)
    const clients = workspace.profileId
        ? await prisma.client.findMany({
              where: { profileId: workspace.profileId },
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
          })
        : []

    const serializedWorkspace = {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        deletedAt: workspace.deletedAt?.toISOString() ?? null,
        hardDeleteAfter: workspace.hardDeleteAfter?.toISOString() ?? null,
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>
                Workspace Settings
            </h2>
            <WorkspaceSettingsPanel
                workspaceId={workspaceId}
                workspace={serializedWorkspace}
                currentUserRole={workspaceRole}
                isGlobalAdmin={isGlobalAdmin}
                memberCount={memberCount}
                integrations={integrations}
                pricingRules={pricingRules}
                clients={clients}
            />
        </div>
    )
}
