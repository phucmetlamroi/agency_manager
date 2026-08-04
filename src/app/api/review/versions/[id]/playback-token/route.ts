// [Review module P1.7] POST /api/review/versions/:id/playback-token (API-SPEC §2.9).
// Member-only. Mints 6h Mux signed tokens (playback/thumbnail/storyboard) for a READY
// video; the client appends ?token= to stream.mux.com / image.mux.com URLs.

import { NextRequest } from 'next/server'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getVersionPlaybackTokens } from '@/lib/review/upload-service'
import { REVIEW_PLAYBACK_DISABLED, REVIEW_CLOSURE_MESSAGE } from '@/lib/review/upload-maintenance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    // [Tệp closure 2026-08-04] Không mint token phát nữa — mỗi lượt xem là tiền delivery
    // Mux. Chặn ở server để bundle cũ (tab mở trước deploy) cũng không stream được.
    if (REVIEW_PLAYBACK_DISABLED) throw apiError(503, 'MAINTENANCE', REVIEW_CLOSURE_MESSAGE)
    const { id } = await params
    return apiJson(await getVersionPlaybackTokens(id))
})
