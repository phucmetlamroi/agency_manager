// [Giao diện 2 · Mission Control · M11 Review Player] MC-namespace full-page player route.
// Mirrors /team/asset/[assetId]: reuses the SAME full-bleed ReviewPlayerShell (frame.io-parity
// scrubber · range-loop · timecode comments · versions · gửi khách duyệt) — the player is
// namespace-agnostic, so this is a thin admin-gated wrapper. /mc/tep opens assets here via
// TeamBrowser playerBase. Admin-gated fail-closed (MC cockpit); editors keep GĐ1 /team/asset.
import { redirect } from 'next/navigation'
import { ReviewPlayerShell } from '@/components/review/player/ReviewPlayerShell'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'

export const dynamic = 'force-dynamic'

export default async function MissionControlReviewPlayerPage({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string; assetId: string }>
    searchParams: Promise<{ v?: string; comment?: string; cmp?: string }>
}) {
    const { workspaceId, assetId } = await params
    const sp = await searchParams
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const user = session.user as { id?: string } | undefined

    return (
        <ReviewPlayerShell
            workspaceId={workspaceId}
            assetId={assetId}
            currentUserId={user?.id ?? ''}
            isAdmin
            initialVersionId={sp.v ?? null}
            initialCommentId={sp.comment ?? null}
            compareParam={sp.cmp ?? null}
        />
    )
}
