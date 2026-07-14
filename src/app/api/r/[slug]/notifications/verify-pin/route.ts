// [review-fixes P4/FR-11] POST /api/r/:slug/notifications/verify-pin — check the 6-digit code
// and create the (email, assetId) subscription. May answer non-neutrally (the guest is entering
// THEIR own code); brute force is bounded by the 5-attempt cap per code + issuance rate-limit.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { verifyGuestPin } from '@/lib/review/guest-subscribe'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z
    .object({
        assetId: z.string().min(1).max(64),
        pin: z.string().trim().regex(/^\d{6}$/),
        email: z.string().trim().email().max(254).optional(),
    })
    .strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:notif:verify:${getClientIp(req)}`, 20, 600)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
            retryAfterSec: rl.retryAfterSec,
        })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)

    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const email = (parsed.data.email ?? guest?.email ?? '').trim().toLowerCase()
    if (!email) return apiError(400, 'VALIDATION_ERROR', 'Enter the email you want updates sent to.')

    const result = await verifyGuestPin({
        share,
        guest,
        assetId: parsed.data.assetId,
        email,
        pin: parsed.data.pin,
        ip: getClientIp(req),
    })
    if (result.ok) return apiJson({ verified: true })
    if (result.reason === 'reviewer_limit') {
        return apiError(403, 'FORBIDDEN', 'This review link is already registered to another email. Ask the team for your own link.', {
            reason: result.reason,
        })
    }
    const messages: Record<string, string> = {
        invalid: 'That code is incorrect. Please check and try again.',
        expired: 'That code has expired. Request a new one.',
        locked: 'Too many wrong tries. Request a new code.',
        no_pin: 'No active code — request a new one.',
    }
    return apiError(400, 'STATE_INVALID', messages[result.reason] ?? messages.invalid, { reason: result.reason })
})
