// [Review module P5.1] POST /api/r/:slug/unlock (API-SPEC §5.5.1) — password gate.
// 5/min per (slug, IP) — brute-force is the whole threat model here (DoD: 429 +
// Retry-After). Wrong password says nothing about whether the link "exists".

import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { guestCookieAttrs, mintUnlockToken, resolveShareGate, unlockCookieName } from '@/lib/review/share-auth'
import { reviewLog } from '@/lib/review/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z.object({ password: z.string().min(1).max(200) }).strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:unlock:${slug}:${getClientIp(req)}`, 5, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
            retryAfterSec: rl.retryAfterSec,
        })
    }

    // Resolve WITHOUT the password gate (this route IS the gate).
    const gate = await resolveShareGate(slug, req.cookies)
    if (gate.state === 'not_found') throw apiError(404, 'SHARE_NOT_FOUND', 'This link is no longer available.')
    if (gate.state === 'revoked') throw apiError(410, 'SHARE_REVOKED', 'This link is no longer available.')
    if (gate.state === 'expired') throw apiError(410, 'SHARE_EXPIRED', 'This link has expired.')
    const share = gate.share
    if (!share.passwordHash) return apiJson({ unlocked: true }) // open link — nothing to unlock

    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const ok = await bcrypt.compare(parsed.data.password, share.passwordHash)
    if (!ok) {
        reviewLog('warn', 'share.auth_fail', { slug6: slug.slice(0, 6), reason: 'wrong_password' })
        return apiError(403, 'FORBIDDEN', 'Incorrect password. Please try again.')
    }

    const token = await mintUnlockToken(share)
    const res = apiJson({ unlocked: true })
    res.cookies.set(unlockCookieName(slug), token.value, guestCookieAttrs(token.maxAgeSec))
    return res
})
