// [Review module P2.2] Team asset-browser — deep link into a specific folder.
// Seeds TeamBrowser with the folder id so a shared/bookmarked URL lands correctly;
// in-app folder navigation updates the URL via history.pushState without re-running
// this server component. Access is enforced per-request by the API routes.
import { TeamBrowser } from '@/components/review/TeamBrowser'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'

// Workspace-scoped admin flag (matches review/access.ts) — gates the FR-B07 folder-delete
// affordance. NOT the global User.role.
async function isWorkspaceAdmin(workspaceId: string): Promise<boolean> {
    try {
        await verifyProfileAdminAccess(workspaceId)
        return true
    } catch {
        return false
    }
}

export default async function TeamFolderPage({
    params,
}: {
    params: Promise<{ workspaceId: string; folderId: string }>
}) {
    const { workspaceId, folderId } = await params
    const session = await getSession()
    const user = session?.user as { id?: string } | undefined
    const admin = await isWorkspaceAdmin(workspaceId)
    return (
        <TeamBrowser workspaceId={workspaceId} initialFolderId={folderId} currentUserId={user?.id ?? ''} isAdmin={admin} />
    )
}
