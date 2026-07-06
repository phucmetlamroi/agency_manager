// [Review module P5.2] GET /api/r/:slug/versions/:versionId/comments (§5.5.4).
// The 5s share-page poll. isInternal=false is enforced in SQL inside the service
// (DoD: curl with a share cookie NEVER returns an internal comment). Supports
// ?since= delta polling with public-only deletedIds.

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { listGuestComments } from '@/lib/review/share-comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; versionId: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, versionId } = await params
    const rl = await limitDb(`r:comments-get:${slug}:${getClientIp(req)}`, 120, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    const since = new URL(req.url).searchParams.get('since') ?? undefined
    return apiJson(await listGuestComments(share, versionId, { since }, guest))
})
