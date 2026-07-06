// [Review module P5.2] POST /api/r/:slug/comment-attachments/initiate — presigned
// R2 PUT for a guest image attachment (image/* only, ≤10MB). Requires guest
// identity (the key embeds the GuestSession id → claim-by-prefix at comment time).

import { NextRequest } from 'next/server'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { initiateGuestAttachment } from '@/lib/review/share-comments'
import { initiateAttachmentSchema } from '@/lib/review/comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string }> }

export const POST = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug } = await params
    const rl = await limitDb(`r:attach-init:${slug}:${getClientIp(req)}`, 10, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many uploads. Please wait a moment.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    if (!guest) return apiError(401, 'UNAUTHORIZED', 'Please add your name and email to attach images.')
    const parsed = await parseBody(req, initiateAttachmentSchema, 'en')
    if (!parsed.ok) return parsed.res
    return apiJson(await initiateGuestAttachment(share, guest, parsed.data), { status: 201 })
})
