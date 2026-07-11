// [Review module P5.2] POST /api/r/:slug/comment-attachments/initiate — presigned
// R2 PUT for a guest image attachment (image/* only, ≤10MB). Requires guest
// identity (the key embeds the GuestSession id → claim-by-prefix at comment time).

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
import { initiateGuestAttachment } from '@/lib/review/share-comments'
import { initiateAttachmentSchema } from '@/lib/review/comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:attach-init:${slug}:${getClientIp(req)}`, 10, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many uploads. Please wait a moment.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    // [P5] known-client links auto-identify; external links still require the modal.
    const { session: guest, rawToken } = await resolveGuestForWrite(
        share,
        req.cookies,
        null,
        req.headers.get('user-agent')?.slice(0, 300) ?? null,
        'Please add your name and email to attach images.',
    )
    const parsed = await parseBody(req, initiateAttachmentSchema, 'en')
    if (!parsed.ok) return parsed.res
    const res = apiJson(await initiateGuestAttachment(share, guest, parsed.data), { status: 201 })
    if (rawToken) res.cookies.set(guestCookieName(slug), rawToken, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    return res
})
