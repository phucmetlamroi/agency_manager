// [Review module P5.2] POST /api/r/:slug/comments/:id/reactions — guest emoji
// reaction (FR-E08 AC3). reactorKey = "g:{guestSessionId}"; idempotent duplicate.

import { NextRequest } from 'next/server'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import {
    GUEST_COOKIE_TTL_SEC,
    guestCookieAttrs,
    guestCookieName,
    requireShare,
    resolveGuestForWrite,
} from '@/lib/review/share-auth'
import { toggleGuestReaction } from '@/lib/review/share-comments'
import { reactionSchema } from '@/lib/review/comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id } = await params
    const rl = await limitDb(`r:reactions:${slug}:${getClientIp(req)}`, 60, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    // [P5] known-client links auto-identify; external links still require the modal.
    const { session: guest, rawToken } = await resolveGuestForWrite(
        share,
        req.cookies,
        null,
        req.headers.get('user-agent')?.slice(0, 300) ?? null,
        'Please add your name and email to react.',
    )
    const parsed = await parseBody(req, reactionSchema, 'en')
    if (!parsed.ok) return parsed.res
    const res = apiJson(await toggleGuestReaction(share, guest, id, parsed.data.emoji, true))
    if (rawToken) res.cookies.set(guestCookieName(slug), rawToken, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    return res
})
