import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { resolveShareToken } from '@/lib/share-link-auth'
import { getShareSnapshot } from '@/actions/share-portal-actions'
import { audit } from '@/lib/audit-log'
import SharePortalClient from '@/components/portal/share/SharePortalClient'

/**
 * [Canonical Clients] PUBLIC share-link portal — no session, the token in the
 * URL is the credential. Every failure mode (invalid / revoked / expired /
 * merged client / rate-limited) renders the SAME not-found page: an attacker
 * probing tokens learns nothing about which ones ever existed.
 */
export const dynamic = 'force-dynamic'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params

    // recordAccess bumps accessCount/lastAccessedAt (page-level only —
    // individual actions re-resolve without recording).
    const scope = await resolveShareToken(token, { recordAccess: true })
    if (!scope) notFound()

    const snapshot = await getShareSnapshot(token)
    if (!snapshot) notFound()

    // Page-level access audit (one row per open, not per action).
    const h = await headers()
    void audit({
        workspaceId: null,
        actorUserId: null,
        action: 'share_link.accessed',
        targetType: 'ClientShareLink',
        targetId: scope.shareLinkId,
        after: {
            clientId: scope.clientId,
            profileId: scope.profileId,
            userAgent: h.get('user-agent')?.slice(0, 200) ?? null,
        },
    })

    return (
        <SharePortalClient
            token={token}
            clientName={snapshot.clientName}
            profileName={snapshot.profileName}
            deliverables={snapshot.tasks as any}
            invoices={snapshot.invoices as any}
        />
    )
}
