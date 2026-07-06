// [Review module P5.2] PATCH /api/r/:slug/comments/:id (edit own) +
// DELETE (delete own) — guest identity must match the comment's GuestSession
// AND the cookie must still be alive (FR-E08 AC4: another browser = read-only).

import { NextRequest } from 'next/server'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withShareRoute } from '@/lib/review/route-auth'
import { getClientIp, limitDb } from '@/lib/review/rate-limit-db'
import { getGuestSession, requireShare } from '@/lib/review/share-auth'
import { deleteGuestComment, editGuestComment, guestEditCommentSchema } from '@/lib/review/share-comments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ slug: string; id: string }> }

export const PATCH = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id } = await params
    const rl = await limitDb(`r:comments-edit:${slug}:${getClientIp(req)}`, 20, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    if (!guest) return apiError(401, 'UNAUTHORIZED', 'Your session has expired. You can no longer edit this comment.')
    const parsed = await parseBody(req, guestEditCommentSchema, 'en')
    if (!parsed.ok) return parsed.res
    return apiJson(await editGuestComment(share, guest, id, parsed.data.body))
})

export const DELETE = withShareRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { slug, id } = await params
    const rl = await limitDb(`r:comments-edit:${slug}:${getClientIp(req)}`, 20, 60)
    if (!rl.success) {
        return apiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', { retryAfterSec: rl.retryAfterSec })
    }
    const share = await requireShare(slug, req.cookies)
    const guest = await getGuestSession(share, req.cookies)
    if (!guest) return apiError(401, 'UNAUTHORIZED', 'Your session has expired. You can no longer delete this comment.')
    return apiJson(await deleteGuestComment(share, guest, id))
})
