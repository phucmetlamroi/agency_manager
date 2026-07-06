// [Review module P2.6] Team → Recently Deleted (FR-B13 view + restore). The /admin
// layout already gates entry; this page mounts the client trash browser. Data comes from
// the P2.1 /api/review/trash + /trash/restore routes (each re-verifies membership).
import { TeamTrash } from '@/components/review/TeamTrash'

export const dynamic = 'force-dynamic'

export default async function TeamTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    return <TeamTrash workspaceId={workspaceId} />
}
