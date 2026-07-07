// [review-fixes P4/FR-11] POST /api/r/:slug/notifications/request-pin — email a 6-digit code
// so a guest can turn on review updates for an asset. ANTI-ENUMERATION: this route ALWAYS
// answers 200 (rate-limit/invalid folded into the body status), never leaking whether an email
// or asset exists. Limits: 3/10min per (email+share), 10/day per IP, 60s cooldown per (email+share).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { requestGuestPin } from '@/lib/review/guest-subscribe'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z
    .object({ assetId: z.string().min(1).max(64), email: z.string().trim().email().max(254).optional() })
    .strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)

    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const email = (parsed.data.email ?? guest?.email ?? '').trim().toLowerCase()
    // No email to send to → uniform 200 (can't reveal that we did nothing).
    if (!email) return apiJson({ status: 'pin_sent' })

    const ip = getClientIp(req)
    // Cooldown (60s) + burst (3/10min per email+share) + IP/day — all fold into a neutral 200.
    const cooldown = await limitDb(`r:notif:cd:${email}:${share.id}`, 1, 60)
    const burst = await limitDb(`r:notif:pin:${email}:${share.id}`, 3, 600)
    const perIp = await limitDb(`r:notif:ip:${ip}`, 10, 86_400)
    if (!cooldown.success || !burst.success || !perIp.success) {
        return apiJson({ status: 'cooldown', retryAfterSec: cooldown.retryAfterSec })
    }

    const status = await requestGuestPin({
        share,
        assetId: parsed.data.assetId,
        email,
        guestSessionId: guest?.id ?? null,
        ip,
    })
    return apiJson({ status })
})
