// [Review module P2.6 + P6.2] Team → Recently Deleted (FR-B13 view + restore +
// Delete-forever). The /team layout gates entry (membership-only); this page mounts the client trash
// browser. Data comes from /api/review/trash + /trash/restore + /trash/purge (each
// re-verifies membership; purge re-verifies workspace ADMIN).
import { TeamTrash } from '@/components/review/TeamTrash'
import { verifyProfileAdminAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'

// Workspace-scoped admin (NOT the global User.role) — gates the "Xóa vĩnh viễn" button.
async function isWorkspaceAdmin(workspaceId: string): Promise<boolean> {
    try {
        await verifyProfileAdminAccess(workspaceId)
        return true
    } catch {
        return false
    }
}

export default async function TeamTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const admin = await isWorkspaceAdmin(workspaceId)
    return <TeamTrash workspaceId={workspaceId} isAdmin={admin} />
}
