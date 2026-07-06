// [Review module P5.1] GET /api/r/:slug — guest share content (API-SPEC §5.5.2).
// No session; gate chain 404→410→410→401 inside requireShare. Response is the
// TRIMMED guest DTO (no workspace/task/uploader/email). Side-effect free — the
// client reports link_opened via POST /events.

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { buildGuestShareContent } from '@/lib/review/share-guest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:content:${slug}:${getClientIp(req)}`, 120, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    return apiJson(await buildGuestShareContent(share, guest?.name ?? null))
})
