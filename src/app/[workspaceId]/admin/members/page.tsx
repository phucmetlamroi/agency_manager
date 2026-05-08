import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getWorkspaceMembers, getWorkspaceInvitations } from '@/actions/member-actions'
import { verifyWorkspaceAccess } from '@/lib/security'
import WorkspaceMembersPanel from '@/components/workspace/WorkspaceMembersPanel'

export default async function AdminMembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Verify access — minimum MEMBER to view, UI restricts actions by role
    let workspaceRole = 'MEMBER'
    let isGlobalAdmin = false
    try {
        const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        workspaceRole = access.workspaceRole
        isGlobalAdmin = access.isGlobalAdmin
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    // Fetch members
    const { members } = await getWorkspaceMembers(workspaceId)

    // Fetch pending invitations (only for ADMIN+)
    let invitations: any[] = []
    if (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' || isGlobalAdmin) {
        const result = await getWorkspaceInvitations(workspaceId)
        invitations = result.invitations
    }

    // Serialize dates for client components
    const serializedMembers = members.map((m: any) => ({
        ...m,
        joinedAt: m.joinedAt?.toISOString?.() ?? m.joinedAt,
    }))

    const serializedInvitations = invitations.map((inv: any) => ({
        ...inv,
        createdAt: inv.createdAt?.toISOString?.() ?? inv.createdAt,
        expiresAt: inv.expiresAt?.toISOString?.() ?? inv.expiresAt,
    }))

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>
                Workspace Members
            </h2>
            <WorkspaceMembersPanel
                workspaceId={workspaceId}
                members={serializedMembers}
                invitations={serializedInvitations}
                currentUserId={session.user.id}
                currentUserRole={workspaceRole}
                isGlobalAdmin={isGlobalAdmin}
            />
        </div>
    )
}
