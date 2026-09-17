// [Giải trí] POST /api/ent/videos/:id/playback-token — ký URL phát cho một phim.
//
// KHÔNG dính REVIEW_PLAYBACK_DISABLED: đó là công tắc đóng dịch vụ Tệp, kho phim
// chạy độc lập. Bất kỳ mã truy cập nào (xem hoặc quản trị) đều xin token được.

import { NextRequest } from 'next/server'
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { mintPlaybackTokens } from '@/lib/review/mux-jwt'
import { requireEntSession } from '@/lib/ent/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ videoId: string }> }

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies)
    const { videoId } = await params

    const video = await prisma.entVideo.findUnique({
        where: { id: videoId },
        select: { pipelineStatus: true, muxPlaybackId: true },
    })
    if (!video) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phim.')
    if (video.pipelineStatus !== ReviewPipelineStatus.READY || !video.muxPlaybackId) {
        throw apiError(409, 'STATE_INVALID', 'Phim chưa sẵn sàng để xem.')
    }

    // TTL 6h: dài hơn mọi bộ phim, nên không ai bị cắt giữa chừng. Hết hạn thì
    // hls.js gặp 403 và tự xin lại (tối đa 2 lần) — xem useEntPlayer.
    const minted = mintPlaybackTokens(video.muxPlaybackId)
    return apiJson({
        playbackId: video.muxPlaybackId,
        token: minted.tokens.playback,
        expiresAt: minted.expiresAt,
    })
})
