// [Giải trí] Một tệp phụ đề.
//   GET    — phục vụ nội dung VTT (bất kỳ mã nào)
//   DELETE — gỡ (chỉ ENT_ADMIN)
//
// Phục vụ qua route SAME-ORIGIN chứ không trỏ thẳng R2 presigned, vì CSP của app
// (next.config.ts) chỉ cho `media-src` tới *.mux.com — thẻ <track> trỏ R2 sẽ bị
// chặn im lặng, phụ đề không hiện mà cũng không báo lỗi gì.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getObjectBytes, deleteObject } from '@/lib/review/r2'
import { requireEntSession } from '@/lib/ent/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ videoId: string; subId: string }> }

export const GET = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies)
    const { videoId, subId } = await params

    // Ràng buộc cả videoId: không cho lấy phụ đề của phim khác bằng cách ghép URL.
    const sub = await prisma.entSubtitle.findFirst({
        where: { id: subId, videoId },
        select: { r2Key: true },
    })
    if (!sub) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phụ đề.')

    const bytes = await getObjectBytes(sub.r2Key)
    return new NextResponse(Buffer.from(bytes), {
        headers: {
            'content-type': 'text/vtt; charset=utf-8',
            // private: kho riêng, không để CDN dùng chung giữ bản sao.
            'cache-control': 'private, max-age=3600',
        },
    })
})

export const DELETE = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { videoId, subId } = await params

    const sub = await prisma.entSubtitle.findFirst({ where: { id: subId, videoId }, select: { id: true, r2Key: true } })
    if (!sub) return apiJson({ deleted: true }) // idempotent

    // Xoá vật thể TRƯỚC, hàng DB sau: thứ tự ngược lại sẽ để R2 giữ tệp mồ côi
    // mà không còn khoá nào trong DB để tìm ra nó.
    await deleteObject(sub.r2Key).catch(() => {})
    await prisma.entSubtitle.delete({ where: { id: sub.id } }).catch(() => {})
    return apiJson({ deleted: true })
})
