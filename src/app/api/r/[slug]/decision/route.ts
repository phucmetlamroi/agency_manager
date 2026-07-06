// [Review module P5.4] POST /api/r/:slug/decision (API-SPEC §5.5.6, FR-F03).
// Approve / Request changes — requires guest identity (inline first-decision
// identity supported, mirroring the comments route). 5/min per (slug, IP).

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
import { guestDecisionSchema, submitGuestDecision } from '@/lib/review/share-decision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const bodySchema = guestDecisionSchema.extend({
    guest: z
        .object({
            name: z.string().trim().min(1).max(120),
            email: z.string().trim().email().max(254),
        })
        .optional(),
})

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:decision:${slug}:${getClientIp(req)}`, 5, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment.', {
            retryAfterSec: rl.retryAfterSec,
        })
    }
    const share = await requireShare(slug, req.cookies)
    const parsed = await parseBody(req, bodySchema, 'en')
    if (!parsed.ok) return parsed.res
    const { guest: guestInput, ...decisionInput } = parsed.data

    let guest = await getGuestSession(share, req.cookies)
    let rawTokenToSet: string | null = null
    if (!guest) {
        if (!guestInput) {
            return apiError(401, 'UNAUTHORIZED', 'Please add your name and email to review.')
        }
        const created = await createGuestSession(share, {
            name: guestInput.name,
            email: guestInput.email.toLowerCase(),
            userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        })
        guest = created.session
        rawTokenToSet = created.rawToken
    }

    const result = await submitGuestDecision(share, guest, decisionInput)
    const res = apiJson(result)
    if (rawTokenToSet) {
        res.cookies.set(guestCookieName(slug), rawTokenToSet, guestCookieAttrs(GUEST_COOKIE_TTL_SEC))
    }
    return res
})
