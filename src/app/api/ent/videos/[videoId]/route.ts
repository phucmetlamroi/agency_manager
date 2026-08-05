// [Giải trí] Sửa tên / gỡ một phim. Chỉ ENT_ADMIN.
//
// Gỡ là XOÁ HẲN, không có thùng rác: kho này của một người, giữ lại bản nháp đã
// gỡ chỉ tốn tiền lưu trữ. Thứ tự dọn theo nếp purge.ts của module Tệp: xoá thứ
// NGOÀI hệ thống trước (Mux, R2), hàng DB sau — ngược lại sẽ để asset Mux tính
// tiền mãi mà không còn khoá nào tìm ra nó.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { abortMultipart } from '@/lib/review/r2'
import { reviewLog } from '@/lib/review/logger'
import { requireEntSession } from '@/lib/ent/auth'
import { teardownEntVideoExternal } from '@/lib/ent/inngest'
import { ENT_TITLE_MAX } from '@/lib/ent/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ videoId: string }> }

const patchSchema = z.object({ title: z.string().min(1).max(ENT_TITLE_MAX) }).strict()

export const PATCH = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { videoId } = await params

    const parsed = await parseBody(req, patchSchema)
    if (!parsed.ok) return parsed.res

    const title = parsed.data.title.trim()
    if (!title) throw apiError(400, 'VALIDATION_ERROR', 'Tên phim không được để trống.')

    const res = await prisma.entVideo.updateMany({ where: { id: videoId }, data: { title } })
    if (res.count === 0) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phim.')
    return apiJson({ id: videoId, title })
})

export const DELETE = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { videoId } = await params

    const video = await prisma.entVideo.findUnique({
        where: { id: videoId },
        select: {
            id: true,
            muxAssetId: true,
            r2Key: true,
            subtitles: { select: { r2Key: true } },
            uploadSessions: {
                where: { completedAt: null, abortedAt: null },
                select: { r2Key: true, r2UploadId: true },
            },
        },
    })
    if (!video) return apiJson({ deleted: true }) // idempotent

    // Gỡ giữa lúc còn đang tải lên: đóng multipart dở dang, không thì R2 vẫn giữ
    // (và tính tiền) các part đã ghi cho tới khi hết vòng đời bucket.
    for (const s of video.uploadSessions) {
        if (s.r2UploadId) await abortMultipart(s.r2Key, s.r2UploadId).catch(() => {})
    }

    await teardownEntVideoExternal({
        muxAssetId: video.muxAssetId,
        r2Key: video.r2Key,
        subtitleKeys: video.subtitles.map((s) => s.r2Key),
    })

    // Cascade dọn EntSubtitle + EntUploadSession. Webhook Mux tới sau sẽ không tìm
    // thấy phim ⇒ consumer trả 'gone' và nuốt sự kiện (không retry vô hạn).
    await prisma.entVideo.delete({ where: { id: videoId } }).catch(() => {})
    reviewLog('info', 'ent.video.deleted', { videoId })
    return apiJson({ deleted: true })
})
