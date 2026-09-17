// [Review module] GET /api/review/download-zip?folders=<ids>&assets=<ids>
//
// ⚠️ [sự cố 2026-07-29] ĐỌC TRƯỚC KHI MỞ RỘNG ĐƯỜNG NÀY.
// Câu "no server buffering … bounded memory even for multi-GB folders" ở bản trước là SAI, và
// nó khiến lỗi lọt tới tận production. Sự thật: byte phải chui qua function, nên bộ nhớ function
// tiêu tốn = (byte ĐỌC được từ R2) − (byte trình duyệt ĐÃ NHẬN). R2 đọc rất nhanh, mạng người
// dùng thì không, nên hiệu số đó phình lên xấp xỉ kích thước file. Vòng `await entryDone` bên
// dưới chỉ chặn giữa CÁC file — bên trong MỘT file thì không có gì ghìm cả.
// Log production đã chứng minh: "instance was killed because it ran out of available memory"
// trên chính route này, với một video 964 MB. Bị giết thì KHÔNG có phản hồi HTTP nào — trình
// duyệt treo request, người dùng thấy vòng xoay quay vĩnh viễn và không hiểu vì sao.
//
// Vì vậy: ASSET KHÔNG còn đi qua đây nữa (TeamBrowser tải thẳng từ R2 bằng URL ký sẵn — 0 MB RAM).
// Đường này giờ chỉ còn phục vụ TẢI CẢ THƯ MỤC, và vẫn mang đúng rủi ro trên. Đã nâng memory lên
// 3009 MB trong vercel.json để mua thêm khoảng thở, nhưng ĐÓ LÀ GIẢM NHẸ, KHÔNG PHẢI CHỮA KHỎI:
// một thư mục đủ lớn vẫn giết được function. Cách chữa thật là đừng proxy byte — trả về danh sách
// URL ký sẵn cho client tự tải, hoặc dựng zip bằng job nền. Chưa làm.
//
// Nothing is re-encoded (STORE method → lossless; a zip never reduces video quality, it just
// bundles many files into one download).
//   • a folder → the whole subtree, relative paths preserved
//   • assets   → each asset's current READY version
// Auth + FR-03 folder scope are enforced by collectZipFiles (reuses getFolderManifest / assertAssetInScope).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Long enough to stream a large folder; Vercel clamps to the plan's ceiling.
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import archiver from 'archiver'
import { withReviewRoute } from '@/lib/review/route-auth'
import { collectZipFiles } from '@/lib/review/download-zip'
import { getObjectStream } from '@/lib/review/r2'
import { reviewLog } from '@/lib/review/logger'

function idList(sp: URLSearchParams, key: string): string[] {
    return (sp.get(key) ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

export const GET = withReviewRoute(async (req: NextRequest) => {
    const sp = new URL(req.url).searchParams
    // Resolve + authorize BEFORE returning the stream, so access errors map to a clean 4xx envelope
    // (not a corrupt half-zip). collectZipFiles throws the standard review error on any failure.
    const plan = await collectZipFiles({ folderIds: idList(sp, 'folders'), assetIds: idList(sp, 'assets') })

    const archive = archiver('zip', { store: true }) // STORE = no recompress → lossless + fast for video
    archive.on('warning', (err) => reviewLog('warn', 'zip.warning', { error: String(err) }))

    // Append entries ONE AT A TIME: open each R2 stream only after the previous entry finished, so we
    // never hold many open R2 connections, and archiver's backpressure paces us to the client's speed
    // (bounded memory even for multi-GB folders).
    const pump = async () => {
        for (const entry of plan.entries) {
            let body: Readable
            try {
                body = await getObjectStream(entry.r2Key)
            } catch (err) {
                reviewLog('warn', 'zip.skip_missing', { key: entry.r2Key, error: String(err) })
                continue
            }
            const entryDone = new Promise<void>((resolve) => archive.once('entry', () => resolve()))
            archive.append(body, { name: entry.zipPath })
            await entryDone
        }
        await archive.finalize()
    }
    pump().catch((err: unknown) => {
        reviewLog('error', 'zip.pump_failed', { error: err instanceof Error ? err.message : String(err) })
        archive.destroy(err instanceof Error ? err : new Error(String(err)))
    })

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>
    return new NextResponse(webStream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${plan.archiveName.replace(/"/g, '')}"`,
            'Cache-Control': 'no-store',
        },
    })
})
