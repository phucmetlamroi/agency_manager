// [Review module P5.5] Team → Link chia sẻ (FR-F04). The /admin layout gates
// entry; data comes from /api/review/shares (server re-verifies membership and
// scopes USER to own + assigned-task links).
import { SharesTable } from '@/components/review/SharesTable'

export const dynamic = 'force-dynamic'

export default async function TeamSharesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    return <SharesTable workspaceId={workspaceId} />
}
