// [Review module P5.1] POST /api/r/:slug/identity — the Name+Email modal target
// (FR-F02). Creates a GuestSession, sets rv_guest_{slug} (raw token; DB keeps the
// sha256 only). Idempotent: a valid existing cookie short-circuits. The privacy
// notice is UI copy — the API only ever returns the NAME back, never the email.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z
    .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(254),
    })
    .strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:identity:${slug}:${getClientIp(req)}`, 5, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
            retryAfterSec: rl.retryAfterSec,
        })
    }
    const share = await requireShare(slug, req.cookies)

    const existing = await getGuestSession(share, req.cookies)
    if (existing) return apiJson({ guest: { name: existing.name } })

    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const { session, rawToken } = await createGuestSession(share, {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    })
    const res = apiJson({ guest: { name: session.name } }, { status: 201 })
    res.cookies.set(guestCookieName(slug), rawToken, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    return res
})
