// [Giải trí] Phụ đề của một phim.
//   GET  — liệt kê (bất kỳ mã nào)
//   POST — tải .srt lên, chuyển sang VTT rồi lưu R2 (chỉ ENT_ADMIN)
//
// KHÔNG có tính năng tự sinh phụ đề: chỉ nhận tệp người dùng đưa vào.

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/db'
import { apiError, apiJson } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { putObjectBytes } from '@/lib/review/r2'
import { reviewLog } from '@/lib/review/logger'
import { requireEntSession } from '@/lib/ent/auth'
import { srtToVtt, SubtitleParseError } from '@/lib/ent/subtitles'
import { ENT_SUBTITLE_MAX_BYTES, entSubtitleKey } from '@/lib/ent/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ videoId: string }> }

export const GET = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies)
    const { videoId } = await params
    const subtitles = await prisma.entSubtitle.findMany({
        where: { videoId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, label: true, lang: true, createdAt: true },
    })
    return apiJson({ subtitles })
})

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })
    const { videoId } = await params

    const video = await prisma.entVideo.findUnique({ where: { id: videoId }, select: { id: true } })
    if (!video) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy phim.')

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) throw apiError(400, 'VALIDATION_ERROR', 'Thiếu tệp phụ đề.')
    if (file.size > ENT_SUBTITLE_MAX_BYTES) {
        throw apiError(413, 'FILE_TOO_LARGE', 'Tệp phụ đề vượt quá 2 MB.')
    }

    const label = String(form?.get('label') ?? '').trim() || file.name.replace(/\.[^.]+$/, '') || 'Phụ đề'
    const langRaw = String(form?.get('lang') ?? '').trim()
    const lang = langRaw ? langRaw.slice(0, 16) : null

    let vtt: string
    try {
        // Đọc UTF-8. Phụ đề tiếng Việt lưu bảng mã cũ (windows-1258) sẽ ra ký tự
        // hỏng — người dùng thấy ngay trên trình phát và tự lưu lại bằng UTF-8.
        ;({ vtt } = srtToVtt(await file.text()))
    } catch (e) {
        if (e instanceof SubtitleParseError) throw apiError(400, 'VALIDATION_ERROR', e.message)
        throw e
    }

    const subId = randomUUID()
    const key = entSubtitleKey(videoId, subId)
    await putObjectBytes(key, Buffer.from(vtt, 'utf8'), 'text/vtt; charset=utf-8')

    const row = await prisma.entSubtitle.create({
        data: { id: subId, videoId, label: label.slice(0, 100), lang, r2Key: key },
        select: { id: true, label: true, lang: true },
    })
    reviewLog('info', 'ent.subtitle.added', { videoId, subId })
    return apiJson(row, { status: 201 })
})
