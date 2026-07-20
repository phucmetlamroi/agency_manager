// [Review module P5.3] Public guest review page /r/{slug} (FR-F02, UI-UX §6).
// No session, English, dark, no app chrome. The gate chain runs server-side
// BEFORE anything renders (KIEN-TRUC §3.3): bad slug/revoked/expired/password
// each get a full-page state; only a valid (unlocked) link reaches the player.
// Middleware already stamps X-Robots-Tag: noindex + Referrer-Policy: no-referrer.

import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { resolveShareGate, getGuestSession, resolveShareClient } from '@/lib/review/share-auth'
import { buildGuestShareContent } from '@/lib/review/share-guest'
import { GuestReviewApp } from '@/components/review/share/GuestReviewApp'
import { GateScreen, PasswordGate } from '@/components/review/share/GateScreens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Video review',
    robots: { index: false, follow: false },
}

export default async function GuestSharePage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const cookieStore = await cookies()
    const gate = await resolveShareGate(slug, cookieStore)

    switch (gate.state) {
        case 'not_found':
        case 'revoked':
            // Same copy for both — a prober can't tell a dead slug from a revoked one.
            return <GateScreen kind="unavailable" />
        case 'expired':
            return <GateScreen kind="expired" />
        case 'password':
            return <PasswordGate slug={slug} />
        case 'ok':
            break
    }

    const guest = await getGuestSession(gate.share, cookieStore)
    // [Fix 2026-07] This used to fall back to the client's name when there was NO guest
    // session, to "skip the Name/Email modal for the agency's own client". That made the
    // player believe it was identified, so it never opened the modal — and every write
    // (approve, comment, react) 401'd, because the API authorizes on the session cookie
    // the modal would have created. The guest could never escape: reloading re-applied the
    // same guess. It bit real clients as soon as the 30-day guest cookie expired.
    //
    // The name is now a PRE-FILL for the modal, nothing more. Clients coming from the
    // portal skip the modal for real via ensureScreeningIdentity, which mints a session
    // from their already-OTP-verified notify email before the iframe loads.
    const suggestedName = guest ? null : (await resolveShareClient(gate.share))?.name ?? null
    const content = await buildGuestShareContent(gate.share, guest?.name ?? null, suggestedName)
    if (content.items.length === 0) {
        // Everything behind the link is in the trash → same "unavailable" screen (FR-B13 AC5).
        return <GateScreen kind="unavailable" />
    }
    return <GuestReviewApp slug={slug} initialContent={content} />
}
