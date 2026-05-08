import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import WorkspaceSettingsPanel from '@/components/workspace/WorkspaceSettingsPanel'

export default async function AdminSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
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
        }
    })

    if (!workspace) redirect(`/${workspaceId}/admin`)

    // Count members
    const memberCount = await prisma.workspaceMember.count({
        where: { workspaceId }
    })

    const serializedWorkspace = {
        ...workspace,
        deletedAt: workspace.deletedAt?.toISOString() ?? null,
        hardDeleteAfter: workspace.hardDeleteAfter?.toISOString() ?? null,
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>
                Workspace Settings
            </h2>
            <WorkspaceSettingsPanel
                workspaceId={workspaceId}
                workspace={serializedWorkspace}
                currentUserRole={workspaceRole}
                isGlobalAdmin={isGlobalAdmin}
                memberCount={memberCount}
            />
        </div>
    )
}
