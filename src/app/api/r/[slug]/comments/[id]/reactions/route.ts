// [Review module P5.2] POST /api/r/:slug/comments/:id/reactions — guest emoji
// reaction (FR-E08 AC3). reactorKey = "g:{guestSessionId}"; idempotent duplicate.

import { NextRequest } from 'next/server'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { toggleGuestReaction } from '@/lib/review/share-comments'
import { reactionSchema } from '@/lib/review/comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id } = await params
    const rl = await limitDb(`r:reactions:${slug}:${getClientIp(req)}`, 60, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    if (!guest) return apiError(401, 'UNAUTHORIZED', 'Please add your name and email to react.')
    const parsed = await parseBody(req, reactionSchema, 'en')
    if (!parsed.ok) return parsed.res
    return apiJson(await toggleGuestReaction(share, guest, id, parsed.data.emoji, true))
})
