// [Review module P4.2] Full-page review player route: team/asset/[assetId]?v=&comment=.
// The /team layout gates entry (membership-only); the shell fetches the stack client-side via
// /api/review/* (each re-verifies workspace membership — defense in depth).
import { ReviewPlayerShell } from '@/components/review/player/ReviewPlayerShell'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'

async function isWorkspaceAdmin(workspaceId: string): Promise<boolean> {
    try {
        await verifyProfileAdminAccess(workspaceId)
        return true
    } catch {
        return false
    }
}

export default async function ReviewPlayerPage({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string; assetId: string }>
    searchParams: Promise<{ v?: string; comment?: string; cmp?: string }>
}) {
    const { workspaceId, assetId } = await params
    const sp = await searchParams
    const session = await getSession()
    const user = session?.user as { id?: string } | undefined
    const admin = await isWorkspaceAdmin(workspaceId)

    return (
        <ReviewPlayerShell
            workspaceId={workspaceId}
            assetId={assetId}
            currentUserId={user?.id ?? ''}
            isAdmin={admin}
            initialVersionId={sp.v ?? null}
            initialCommentId={sp.comment ?? null}
            compareParam={sp.cmp ?? null}
        />
    )
}
