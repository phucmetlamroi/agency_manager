// [Review module P2.2] Team asset-browser — deep link into a specific folder.
// Seeds TeamBrowser with the folder id so a shared/bookmarked URL lands correctly;
// in-app folder navigation updates the URL via history.pushState without re-running
// this server component. Access is enforced per-request by the API routes.
import { TeamBrowser } from '@/components/review/TeamBrowser'

export const dynamic = 'force-dynamic'

export default async function TeamFolderPage({
    params,
}: {
    params: Promise<{ workspaceId: string; folderId: string }>
}) {
    const { workspaceId, folderId } = await params
    return <TeamBrowser workspaceId={workspaceId} initialFolderId={folderId} />
}
