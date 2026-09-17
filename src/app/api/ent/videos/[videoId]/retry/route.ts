// [Giải trí] POST /api/ent/videos/{id}/retry — chạy lại việc xử lý từ TỆP GỐC.
//
// Có route này vì trước đây một phim kẹt chỉ có hai lối thoát: chờ janitor 20h
// tối, hoặc gỡ đi rồi tải lên lại 1,8 GB. Tệp gốc vẫn nằm nguyên trên R2, nên
// chạy lại chỉ là bắn lại một sự kiện.
//
// KHÔNG BAO GIỜ được tạo asset Mux thứ hai — mỗi asset là một lần trả tiền encode.
// Hai lớp chặn: (1) route từ chối thẳng nếu phim đã có muxAssetId; (2) bản thân
// entProcessUpload cũng kiểm lại muxAssetId trước khi gọi Mux.

import { NextRequest } from 'next/server'
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { reviewLog } from '@/lib/review/logger'
import { headObject } from '@/lib/review/r2'
import { inngest } from '@/lib/review/inngest'
import { requireEntSession } from '@/lib/ent/auth'
import { ENT_EVENTS } from '@/lib/ent/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ videoId: string }> }

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const session = await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { videoId } = await params

    const video = await prisma.entVideo.findUnique({
        where: { id: videoId },
        select: { id: true, title: true, pipelineStatus: true, muxAssetId: true, r2Key: true },
    })
    if (!video) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phim.')

    if (video.pipelineStatus === ReviewPipelineStatus.READY) {
        throw apiError(409, 'STATE_INVALID', 'Phim này đã sẵn sàng rồi.')
    }
    if (video.pipelineStatus === ReviewPipelineStatus.UPLOADING) {
        throw apiError(409, 'STATE_INVALID', 'Phim đang tải lên — hãy đợi tải xong đã.')
    }
    if (video.muxAssetId) {
        // Mux ĐÃ nhận việc. Bắn lại chỉ tốn tiền chứ không nhanh hơn: nếu asset
        // hỏng thật thì webhook 'errored' hoặc janitor sẽ chuyển sang Lỗi, lúc đó
        // gỡ phim rồi tải lại là đường đúng.
        throw apiError(409, 'STATE_INVALID', 'Mux đã nhận việc cho phim này — chạy lại sẽ bị tính tiền chuyển mã hai lần.')
    }
    if (!video.r2Key || !(await headObject(video.r2Key))) {
        throw apiError(409, 'STATE_INVALID', 'Không còn tệp gốc trên kho lưu trữ — cần tải phim lên lại.')
    }

    // Đưa về PROCESSING (từ FAILED hoặc UPLOADED) và xoá thông báo lỗi cũ, để lần
    // chạy này không bị hiểu nhầm là vẫn đang hỏng.
    await prisma.entVideo.updateMany({
        where: { id: videoId, pipelineStatus: { not: ReviewPipelineStatus.READY } },
        data: { pipelineStatus: ReviewPipelineStatus.PROCESSING, errorMessage: null },
    })
    await inngest.send({ name: ENT_EVENTS.UPLOAD_COMPLETED, data: { videoId } })

    reviewLog('info', 'ent.video.retry', { videoId, by: session.userId, from: video.pipelineStatus })
    return apiJson({ ok: true })
})
