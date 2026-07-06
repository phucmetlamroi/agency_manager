// [Review module P5.2] POST /api/r/:slug/comments (§5.5.5) — guest comment/reply.
// First-comment identity: if no rv_guest cookie yet, the body may carry
// { guest: { name, email } } → a GuestSession is created and the cookie is set
// on THIS response (one round-trip, matches the identity-modal-then-send UX).
// Everything else (visibility, author linkage) is forced server-side.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import {
    GUEST_COOKIE_TTL_SEC,
    createGuestSession,
    getGuestSession,
    guestCookieAttrs,
    guestCookieName,
    requireShare,
} from '@/lib/review/share-auth'
import { createGuestComment, guestCreateCommentSchema } from '@/lib/review/share-comments'
import { apiJson } from '@/lib/review/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const bodySchema = guestCreateCommentSchema.extend({
    guest: z
        .object({
            name: z.string().trim().min(1).max(120),
            email: z.string().trim().email().max(254),
        })
        .optional(),
})

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const ip = getClientIp(req)
    const [perMin, perHour] = await Promise.all([
        limitDb(`r:comments-post:${slug}:${ip}`, 10, 60),
        limitDb(`r:comments-post-h:${slug}:${ip}`, 60, 3600),
    ])
    const blocked = !perMin.success ? perMin : !perHour.success ? perHour : null
    if (blocked) {
        return apiError(429, 'RATE_LIMITED', 'You are commenting too fast. Please wait a moment.', {
            retryAfterSec: blocked.retryAfterSec,
        })
    }

    const share = await requireShare(slug, req.cookies)
    const parsed = await parseBody(req, bodySchema, 'en')
    if (!parsed.ok) return parsed.res
    const { guest: guestInput, ...commentInput } = parsed.data

    let guest = await getGuestSession(share, req.cookies)
    let rawTokenToSet: string | null = null
    if (!guest) {
        if (!guestInput) {
            return apiError(401, 'UNAUTHORIZED', 'Please add your name and email to comment.')
        }
        const created = await createGuestSession(share, {
            name: guestInput.name,
            email: guestInput.email.toLowerCase(),
            userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        })
        guest = created.session
        rawTokenToSet = created.rawToken
    }

    const result = await createGuestComment(share, guest, commentInput)
    const res = apiJson(result, { status: 201 })
    if (rawTokenToSet) {
        res.cookies.set(guestCookieName(slug), rawTokenToSet, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    }
    return res
})
