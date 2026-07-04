// [Review module P2.2] Team asset-browser — root view. The /admin layout already
// gates entry (profile OWNER/ADMIN) and provides the shell; this page just mounts
// the client browser at the workspace root. All data is fetched client-side via the
// P2.1 /api/review/* routes (each re-verifies membership, defense in depth).
import { TeamBrowser } from '@/components/review/TeamBrowser'

export const dynamic = 'force-dynamic'

export default async function TeamPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    return <TeamBrowser workspaceId={workspaceId} initialFolderId={null} />
}
