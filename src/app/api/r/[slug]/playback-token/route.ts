// [Review module P5.1] POST /api/r/:slug/playback-token (API-SPEC §5.5.3) — mint
// share-scoped Mux signed tokens for ONE version the share exposes. Same response
// shape as the internal §2.9 route so the player's refresh path is identical.
// TTL = min(6h, share expiry). Side-effect: asset_viewed activity (30-min debounce).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import {
    getGuestSession,
    guestCookieAttrs,
    requireShare,
    shareTokenTtlSec,
    throttleCookieName,
} from '@/lib/review/share-auth'
import { assertVersionInShare } from '@/lib/review/share-guest'
import { readThrottle, recordAssetViewed, throttleAllows, THROTTLE_COOKIE_TTL_SEC } from '@/lib/review/share-tracking'
import { mintPlaybackTokens } from '@/lib/review/mux-jwt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z.object({ versionId: z.string().min(1) }).strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:ptoken:${slug}:${getClientIp(req)}`, 30, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const { version, asset } = await assertVersionInShare(share, parsed.data.versionId)
    if (version.pipelineStatus !== 'READY' || !version.muxPlaybackId) {
        throw apiError(409, 'STATE_INVALID', 'This video is still processing — check back in a few minutes.')
    }

    const { tokens, expiresAt } = mintPlaybackTokens(version.muxPlaybackId, shareTokenTtlSec(share))

    // asset_viewed — 30-min per-session debounce via the rv_t cookie.
    const throttle = readThrottle(req.cookies, slug)
    const res = apiJson({ playbackId: version.muxPlaybackId, tokens, expiresAt })
    if (throttleAllows(throttle.v)) {
        const guest = await getGuestSession(share, req.cookies)
        await recordAssetViewed(
            share,
            { assetId: asset.id, versionId: version.id, versionNumber: version.versionNumber },
            guest,
        )
        res.cookies.set(
            throttleCookieName(slug),
            JSON.stringify({ ...throttle, v: Math.floor(Date.now() / 1000) }),
            guestCookieAttrs(THROTTLE_COOKIE_TTL_SEC),
        )
    }
    return res
})
