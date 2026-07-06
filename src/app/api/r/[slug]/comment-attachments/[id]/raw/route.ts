// [Review module P5.2] GET /api/r/:slug/comment-attachments/:id/raw — 302 to a
// fresh signed R2 GET for a PUBLIC comment's image inside THIS share's scope.
// (The internal /api/review/comment-attachments/:id/raw is member-authed.)

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { requireShare } from '@/lib/review/share-auth'
import { getGuestAttachmentRawUrl } from '@/lib/review/share-comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

export const GET = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id } = await params
    const rl = await limitDb(`r:attach-raw:${slug}:${getClientIp(req)}`, 120, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const url = await getGuestAttachmentRawUrl(share, id)
    return NextResponse.redirect(url, 302)
})
