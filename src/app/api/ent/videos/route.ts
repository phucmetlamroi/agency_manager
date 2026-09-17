// [Giải trí] GET /api/ent/videos — danh sách kho phim cho giao diện người xem.
//
// Ảnh bìa phải KÝ: playback policy của Mux là 'signed', URL ảnh không token sẽ 403.
// Mỗi phim một chữ ký RSA — đủ rẻ cho vài chục phim; nếu kho phình lên hàng trăm
// thì đổi sang một token chung cho cả trang (Mux ký theo playbackId nên không gộp
// được, lúc đó phải chuyển sang ảnh bìa tự lưu trên R2).

import { NextRequest } from 'next/server'
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { signMuxToken } from '@/lib/review/mux-jwt'
import { requireEntSession } from '@/lib/ent/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POSTER_TTL_SEC = 6 * 60 * 60

export const GET = withReviewRoute(async (req: NextRequest) => {
    const session = await requireEntSession(req.cookies)

    const rows = await prisma.entVideo.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            title: true,
            pipelineStatus: true,
            errorMessage: true,
            durationMs: true,
            width: true,
            height: true,
            sizeBytes: true,
            muxAssetId: true,
            muxPlaybackId: true,
            posterTime: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { subtitles: true } },
        },
    })

    const exp = Math.floor(Date.now() / 1000) + POSTER_TTL_SEC
    const videos = rows.map((v) => {
        let posterUrl: string | null = null
        if (v.pipelineStatus === ReviewPipelineStatus.READY && v.muxPlaybackId) {
            const token = signMuxToken(v.muxPlaybackId, 't', exp)
            const time = v.posterTime != null ? `time=${v.posterTime}&` : ''
            posterUrl = `https://image.mux.com/${v.muxPlaybackId}/thumbnail.webp?${time}width=640&token=${token}`
        }
        return {
            id: v.id,
            title: v.title,
            status: v.pipelineStatus,
            errorMessage: v.errorMessage,
            durationMs: v.durationMs,
            width: v.width,
            height: v.height,
            sizeBytes: v.sizeBytes.toString(),
            subtitleCount: v._count.subtitles,
            posterUrl,
            createdAt: v.createdAt.toISOString(),
            // Hai trường dưới đây là thứ duy nhất cho phép giao diện phân biệt
            // "đang chạy" với "đã kẹt" (xem lib/ent/progress.ts). KHÔNG lộ chính
            // muxAssetId ra ngoài — người xem không cần biết khoá của nhà cung cấp.
            hasMuxAsset: v.muxAssetId != null,
            updatedAt: v.updatedAt.toISOString(),
        }
    })

    // Người xem chỉ thấy phim đã sẵn sàng; người up thấy cả hàng đang xử lý/lỗi
    // để còn biết đường xử lý.
    const visible = session.role === 'ENT_ADMIN' ? videos : videos.filter((v) => v.status === 'READY')
    return apiJson({ videos: visible, role: session.role })
})
