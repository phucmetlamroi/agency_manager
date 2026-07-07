// [Review module P2.2] Team asset-browser — root view. The /admin layout already
// gates entry (profile OWNER/ADMIN) and provides the shell; this page just mounts
// the client browser at the workspace root. All data is fetched client-side via the
// P2.1 /api/review/* routes (each re-verifies membership, defense in depth).
import { TeamBrowser } from '@/components/review/TeamBrowser'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'

// Workspace-scoped admin flag (matches the server rule in review/access.ts) — gates the
// FR-B07 folder-delete affordance. NOT the global User.role.
async function isWorkspaceAdmin(workspaceId: string): Promise<boolean> {
    try {
        await verifyProfileAdminAccess(workspaceId)
        return true
    } catch {
        return false
    }
}

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    const user = session?.user as { id?: string } | undefined
    const admin = await isWorkspaceAdmin(workspaceId)
    return (
        <TeamBrowser workspaceId={workspaceId} initialFolderId={null} currentUserId={user?.id ?? ''} isAdmin={admin} />
    )
}
