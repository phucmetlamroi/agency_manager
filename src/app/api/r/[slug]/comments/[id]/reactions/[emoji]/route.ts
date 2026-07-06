// [Review module P5.2] DELETE /api/r/:slug/comments/:id/reactions/:emoji —
// remove the CURRENT guest's reaction (URL-encoded emoji path segment).

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { toggleGuestReaction } from '@/lib/review/share-comments'
import { reactionSchema } from '@/lib/review/comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string; emoji: string }> }

export const DELETE = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id, emoji } = await params
    const rl = await limitDb(`r:reactions:${slug}:${getClientIp(req)}`, 60, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    if (!guest) return apiError(401, 'UNAUTHORIZED', 'Your session has expired.')
    const decoded = decodeURIComponent(emoji)
    const parsed = reactionSchema.safeParse({ emoji: decoded })
    if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Invalid emoji.')
    return apiJson(await toggleGuestReaction(share, guest, id, decoded, false))
})
