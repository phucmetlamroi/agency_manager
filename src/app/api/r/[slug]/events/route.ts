// [Review module P5.1] POST /api/r/:slug/events (API-SPEC §5.5.8, FR-F06) — the
// ONLY writer for link_opened (viewCount++/lastViewedAt) and an alternate path
// for asset_viewed. commented/downloaded/decision are side-effects of their own
// routes and are rejected here. Debounce: 1 event / session / 30 min (cookie).

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, guestCookieAttrs, requireShare, throttleCookieName } from '@/lib/review/share-auth'
import { assertVersionInShare } from '@/lib/review/share-guest'
import {
    readThrottle,
    recordAssetViewed,
    recordLinkOpened,
    throttleAllows,
    THROTTLE_COOKIE_TTL_SEC,
} from '@/lib/review/share-tracking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

const schema = z
    .object({
        type: z.enum(['link_opened', 'asset_viewed']),
        versionId: z.string().optional(),
    })
    .strict()

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:events:${slug}:${getClientIp(req)}`, 60, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const parsed = await parseBody(req, schema, 'en')
    if (!parsed.ok) return parsed.res

    const throttle = readThrottle(req.cookies, slug)
    const res = apiJson({ ok: true })
    const nowSec = Math.floor(Date.now() / 1000)

    if (parsed.data.type === 'link_opened') {
        if (throttleAllows(throttle.o)) {
            const guest = await getGuestSession(share, req.cookies)
            await recordLinkOpened(share, guest, req.headers.get('user-agent'))
            res.cookies.set(
                throttleCookieName(slug),
                JSON.stringify({ ...throttle, o: nowSec }),
                guestCookieAttrs(THROTTLE_COOKIE_TTL_SEC),
            )
        }
        return res
    }

    // asset_viewed — needs a version the share actually exposes.
    if (!parsed.data.versionId) return apiError(400, 'VALIDATION_ERROR', 'versionId is required for asset_viewed.')
    if (throttleAllows(throttle.v)) {
        const { version, asset } = await assertVersionInShare(share, parsed.data.versionId)
        const guest = await getGuestSession(share, req.cookies)
        await recordAssetViewed(
            share,
            { assetId: asset.id, versionId: version.id, versionNumber: version.versionNumber },
            guest,
        )
        res.cookies.set(
            throttleCookieName(slug),
            JSON.stringify({ ...throttle, v: nowSec }),
            guestCookieAttrs(THROTTLE_COOKIE_TTL_SEC),
        )
    }
    return res
})
